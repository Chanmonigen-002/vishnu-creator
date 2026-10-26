"""Vishnu Dub Engine — Resumable model downloader with SHA-256 verification."""

import hashlib
import os
import shutil
from pathlib import Path
from typing import Callable, Optional

import httpx
import psutil


def compute_sha256(file_path: Path, chunk_size: int = 1024 * 1024) -> str:
    """Compute the SHA-256 hex digest of a file."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(chunk_size):
            hasher.update(chunk)
    return hasher.hexdigest().lower()


def check_free_space(dest_path: Path, required_bytes: int, safety_margin_gb: float = 1.0) -> None:
    """Ensure destination drive has enough free space."""
    target_dir = dest_path.parent
    target_dir.mkdir(parents=True, exist_ok=True)
    usage = psutil.disk_usage(str(target_dir.resolve()))
    safety_bytes = int(safety_margin_gb * (1024**3))
    if usage.free < required_bytes + safety_bytes:
        free_gb = round(usage.free / (1024**3), 2)
        needed_gb = round((required_bytes + safety_bytes) / (1024**3), 2)
        raise OSError(
            f"Insufficient disk space on {target_dir}: {free_gb} GB free, "
            f"need at least {needed_gb} GB (including {safety_margin_gb} GB safety margin)"
        )


async def download_file(
    url: str,
    dest_path: Path,
    expected_sha256: Optional[str] = None,
    chunk_size: int = 1024 * 1024,
    on_progress: Optional[Callable[[int, int], None]] = None,
    timeout: float = 300.0,
) -> Path:
    """Download a file with HTTP Range resume support and SHA-256 verification.

    Args:
        url: Remote file URL.
        dest_path: Destination local file path.
        expected_sha256: Optional expected SHA-256 hex digest.
        chunk_size: Streaming chunk size in bytes.
        on_progress: Optional callback with signature (downloaded_bytes, total_bytes).
        timeout: HTTP request timeout in seconds.

    Returns:
        The verified Path to the downloaded file.
    """
    dest_path = Path(dest_path)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    # If destination file already exists and matches checksum, skip download
    if dest_path.exists() and dest_path.is_file():
        if expected_sha256:
            current_hash = compute_sha256(dest_path)
            if current_hash == expected_sha256.lower():
                if on_progress:
                    size = dest_path.stat().st_size
                    on_progress(size, size)
                return dest_path
            dest_path.unlink()
        else:
            return dest_path

    part_path = dest_path.with_name(f"{dest_path.name}.part")
    start_byte = 0
    if part_path.exists() and part_path.is_file():
        start_byte = part_path.stat().st_size

    headers = {}
    if start_byte > 0:
        headers["Range"] = f"bytes={start_byte}-"

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        # First attempt (with Range if resuming)
        response = await client.get(url, headers=headers)

        if response.status_code == 416:
            # Range not satisfiable (e.g. part file is already complete or invalid)
            part_path.unlink(missing_ok=True)
            start_byte = 0
            headers.pop("Range", None)
            response = await client.get(url, headers=headers)

        response.raise_for_status()

        is_resumed = response.status_code == 206
        if not is_resumed:
            start_byte = 0
            open_mode = "wb"
        else:
            open_mode = "ab"

        content_length = response.headers.get("content-length")
        total_bytes = (int(content_length) + start_byte) if content_length else 0

        if total_bytes > 0:
            remaining_bytes = total_bytes - start_byte
            check_free_space(dest_path, remaining_bytes)

        downloaded = start_byte

        # Stream content
        # Because response has already buffered headers, stream chunks
        async with client.stream("GET", url, headers=headers) as stream_resp:
            stream_resp.raise_for_status()
            with open(part_path, open_mode) as f:
                async for chunk in stream_resp.aiter_bytes(chunk_size):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if on_progress:
                            on_progress(downloaded, total_bytes)

    # Verify SHA-256 checksum if required
    if expected_sha256:
        calculated = compute_sha256(part_path)
        if calculated != expected_sha256.lower():
            part_path.unlink(missing_ok=True)
            raise ValueError(
                f"SHA-256 verification failed for {dest_path.name}: "
                f"expected {expected_sha256.lower()}, got {calculated}"
            )

    # Atomic move into destination
    if dest_path.exists():
        dest_path.unlink()
    part_path.rename(dest_path)

    return dest_path


def download_file_sync(
    url: str,
    dest_path: Path,
    expected_sha256: Optional[str] = None,
    chunk_size: int = 1024 * 1024,
    on_progress: Optional[Callable[[int, int], None]] = None,
    timeout: float = 300.0,
) -> Path:
    """Synchronous wrapper around download_file for non-async callers."""
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(
                asyncio.run,
                download_file(url, dest_path, expected_sha256, chunk_size, on_progress, timeout)
            ).result()
    else:
        return asyncio.run(
            download_file(url, dest_path, expected_sha256, chunk_size, on_progress, timeout)
        )
