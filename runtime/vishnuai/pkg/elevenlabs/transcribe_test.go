package elevenlabs

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestElevenLabsTranscription(t *testing.T) {
	tmpDir := t.TempDir()
	audioPath := filepath.Join(tmpDir, "sample.wav")
	if err := os.WriteFile(audioPath, []byte("fake-audio-bytes"), 0644); err != nil {
		t.Fatalf("failed to create dummy audio file: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/speech-to-text" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("xi-api-key") != "test-api-key" {
			t.Errorf("missing or incorrect xi-api-key header: %s", r.Header.Get("xi-api-key"))
		}

		resp := scribeResponse{
			Text:         "សួស្តីកម្ពុជា",
			LanguageCode: "khm",
			Words: []scribeWord{
				{Text: "សួស្តី", Start: 0.1, End: 0.8, Type: "word"},
				{Text: "(laughter)", Start: 0.8, End: 1.1, Type: "audio_event"},
				{Text: "កម្ពុជា", Start: 1.2, End: 2.5, Type: "word"},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewTranscribeClient(server.URL, "test-api-key", "scribe_v1", "")
	res, err := client.Transcription(audioPath, "km", tmpDir)
	if err != nil {
		t.Fatalf("transcription failed: %v", err)
	}

	if res.Text != "សួស្តីកម្ពុជា" {
		t.Errorf("expected text 'សួស្តីកម្ពុជា', got '%s'", res.Text)
	}
	if res.Language != "khm" {
		t.Errorf("expected language 'khm', got '%s'", res.Language)
	}
	if len(res.Words) != 2 {
		t.Fatalf("expected 2 words (excluding audio_event), got %d", len(res.Words))
	}
	if res.Words[0].Text != "សួស្តី" || res.Words[0].Start != 0.1 {
		t.Errorf("unexpected first word: %+v", res.Words[0])
	}
	if res.Words[1].Text != "កម្ពុជា" || res.Words[1].End != 2.5 {
		t.Errorf("unexpected second word: %+v", res.Words[1])
	}
}
