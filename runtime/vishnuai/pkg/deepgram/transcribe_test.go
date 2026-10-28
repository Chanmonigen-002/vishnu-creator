package deepgram

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestDeepgramTranscription(t *testing.T) {
	tmpDir := t.TempDir()
	audioPath := filepath.Join(tmpDir, "sample.wav")
	if err := os.WriteFile(audioPath, []byte("fake-wav-bytes"), 0644); err != nil {
		t.Fatalf("failed to create dummy audio file: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/listen" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Token test-token" {
			t.Errorf("missing or incorrect authorization header: %s", r.Header.Get("Authorization"))
		}

		resp := deepgramResponse{}
		channel := deepgramChannel{
			DetectedLanguage: "en",
			Alternatives: []deepgramAlternative{
				{
					Transcript: "Hello deepgram speech recognition",
					Words: []deepgramWord{
						{Word: "Hello", Start: 0.1, End: 0.5},
						{Word: "deepgram", Start: 0.6, End: 1.1},
						{Word: "speech", Start: 1.2, End: 1.6},
						{Word: "recognition", Start: 1.7, End: 2.4},
					},
				},
			},
		}
		resp.Results.Channels = append(resp.Results.Channels, channel)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewTranscribeClient(server.URL, "test-token", "nova-3", "")
	res, err := client.Transcription(audioPath, "en", tmpDir)
	if err != nil {
		t.Fatalf("transcription failed: %v", err)
	}

	if res.Text != "Hello deepgram speech recognition" {
		t.Errorf("unexpected text: '%s'", res.Text)
	}
	if len(res.Words) != 4 {
		t.Fatalf("expected 4 words, got %d", len(res.Words))
	}
	if res.Words[0].Text != "Hello" || res.Words[0].Start != 0.1 {
		t.Errorf("unexpected first word: %+v", res.Words[0])
	}
	if res.Words[3].Text != "recognition" || res.Words[3].End != 2.4 {
		t.Errorf("unexpected last word: %+v", res.Words[3])
	}
}
