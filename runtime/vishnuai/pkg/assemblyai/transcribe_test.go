package assemblyai

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAssemblyAITranscription(t *testing.T) {
	tmpDir := t.TempDir()
	audioPath := filepath.Join(tmpDir, "sample.wav")
	if err := os.WriteFile(audioPath, []byte("fake-wav-bytes"), 0644); err != nil {
		t.Fatalf("failed to create dummy audio file: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("authorization") != "test-api-key" {
			t.Errorf("missing or incorrect authorization header: %s", r.Header.Get("authorization"))
		}

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v2/upload":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(uploadResponse{
				UploadURL: "https://cdn.assemblyai.com/upload/sample-id",
			})

		case r.Method == http.MethodPost && r.URL.Path == "/v2/transcript":
			var req transcriptRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("failed to decode request body: %v", err)
			}
			if req.AudioURL != "https://cdn.assemblyai.com/upload/sample-id" {
				t.Errorf("unexpected audio_url: %s", req.AudioURL)
			}
			if req.LanguageCode != "km" {
				t.Errorf("unexpected language_code: %s", req.LanguageCode)
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(transcriptInitResponse{
				ID:     "trans_12345",
				Status: "queued",
			})

		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/v2/transcript/"):
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(transcriptPollResponse{
				ID:           "trans_12345",
				Status:       "completed",
				LanguageCode: "km",
				Text:         "ជំរាបសួរ ពិភពលោក",
				Words: []assemblyAIWord{
					{Text: "ជំរាបសួរ", Start: 200, End: 800},
					{Text: "ពិភពលោក", Start: 850, End: 1500},
				},
			})

		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewTranscribeClient(server.URL, "test-api-key", "universal", "")
	res, err := client.Transcription(audioPath, "km", tmpDir)
	if err != nil {
		t.Fatalf("transcription failed: %v", err)
	}

	if res.Text != "ជំរាបសួរ ពិភពលោក" {
		t.Errorf("unexpected text: '%s'", res.Text)
	}
	if len(res.Words) != 2 {
		t.Fatalf("expected 2 words, got %d", len(res.Words))
	}
	// Verify ms to s conversion
	if res.Words[0].Text != "ជំរាបសួរ" || res.Words[0].Start != 0.2 || res.Words[0].End != 0.8 {
		t.Errorf("unexpected word 0: %+v", res.Words[0])
	}
	if res.Words[1].Text != "ពិភពលោក" || res.Words[1].Start != 0.85 || res.Words[1].End != 1.5 {
		t.Errorf("unexpected word 1: %+v", res.Words[1])
	}
}

func TestAssemblyAITranscriptionMissingKey(t *testing.T) {
	client := NewTranscribeClient("https://api.assemblyai.com", "", "universal", "")
	_, err := client.Transcription("test.wav", "en", ".")
	if err == nil {
		t.Fatalf("expected error when API key is missing")
	}
}
