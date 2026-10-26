"""Tests for vishnu_dub.downloader."""

import hashlib
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest

from vishnu_dub.downloader import (
    check_free_space,
    compute_sha256,
    download_file,
    download_file_sync,
)


def test_compute_sha256(tmp_path: Path):
    test_file = tmp_path / "sample.bin"
    content = b"Vishnu Creator Khmer Foundation dubbing engine"
    test_file.write_bytes(content)

    expected = hashlib.sha256(content).hexdigest()
    assert compute_sha256(test_file) == expected


def test_check_free_space(tmp_path: Path):
    # Should succeed for small request
    check_free_space(tmp_path / "model.bin", required_bytes=1024, safety_margin_gb=0.01)

    # Should raise OSError when required bytes exceed free space
    with patch("psutil.disk_usage") as mock_usage:
        mock_usage.return_value.free = 500  # only 500 bytes free
        with pytest.raises(OSError, match="Insufficient disk space"):
            check_free_space(tmp_path / "model.bin", required_bytes=1000, safety_margin_gb=0.01)


@pytest.mark.asyncio
async def test_download_file_full_and_checksum_verification(tmp_path: Path):
    dest = tmp_path / "model.bin"
    payload = b"Pretrained model weight tensors 1234567890"
    expected_hash = hashlib.sha256(payload).hexdigest()

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=payload,
            headers={"content-length": str(len(payload))},
        )

    transport = httpx.MockTransport(mock_handler)
    with patch("httpx.AsyncClient", return_value=httpx.AsyncClient(transport=transport)):
        result = await download_file(
            url="https://models.vishnuai.org/weights.bin",
            dest_path=dest,
            expected_sha256=expected_hash,
        )

    assert result.exists()
    assert result.read_bytes() == payload

    # Re-running with existing valid file skips download
    result2 = await download_file(
        url="https://models.vishnuai.org/weights.bin",
        dest_path=dest,
        expected_sha256=expected_hash,
    )
    assert result2 == dest


@pytest.mark.asyncio
async def test_download_file_checksum_mismatch_removes_part(tmp_path: Path):
    dest = tmp_path / "corrupt_model.bin"
    payload = b"Corrupted bytes"
    wrong_hash = "0000000000000000000000000000000000000000000000000000000000000000"

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=payload,
            headers={"content-length": str(len(payload))},
        )

    transport = httpx.MockTransport(mock_handler)
    with patch("httpx.AsyncClient", return_value=httpx.AsyncClient(transport=transport)):
        with pytest.raises(ValueError, match="SHA-256 verification failed"):
            await download_file(
                url="https://models.vishnuai.org/corrupt.bin",
                dest_path=dest,
                expected_sha256=wrong_hash,
            )

    assert not dest.exists()
    assert not dest.with_name("corrupt_model.bin.part").exists()


@pytest.mark.asyncio
async def test_download_file_resumes_from_part(tmp_path: Path):
    dest = tmp_path / "resumed_model.bin"
    part = dest.with_name("resumed_model.bin.part")

    part1 = b"Part 1: 0123456789"
    part2 = b"Part 2: abcdefghij"
    full_payload = part1 + part2
    expected_hash = hashlib.sha256(full_payload).hexdigest()

    # Create pre-existing .part file
    part.write_bytes(part1)

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        range_header = request.headers.get("range")
        if range_header == f"bytes={len(part1)}-":
            return httpx.Response(
                206,
                content=part2,
                headers={
                    "content-length": str(len(part2)),
                    "content-range": f"bytes {len(part1)}-{len(full_payload)-1}/{len(full_payload)}",
                },
            )
        return httpx.Response(200, content=full_payload)

    transport = httpx.MockTransport(mock_handler)
    with patch("httpx.AsyncClient", return_value=httpx.AsyncClient(transport=transport)):
        result = await download_file(
            url="https://models.vishnuai.org/resumed.bin",
            dest_path=dest,
            expected_sha256=expected_hash,
        )

    assert result.exists()
    assert result.read_bytes() == full_payload
    assert not part.exists()


def test_download_file_sync(tmp_path: Path):
    dest = tmp_path / "sync_model.bin"
    payload = b"Synchronous download wrapper test"
    expected_hash = hashlib.sha256(payload).hexdigest()

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=payload)

    transport = httpx.MockTransport(mock_handler)
    with patch("httpx.AsyncClient", return_value=httpx.AsyncClient(transport=transport)):
        result = download_file_sync(
            url="https://models.vishnuai.org/sync.bin",
            dest_path=dest,
            expected_sha256=expected_hash,
        )

    assert result.exists()
    assert result.read_bytes() == payload
