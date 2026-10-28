package fishaudio

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"vishnu-ai/internal/types"
)

func TestSynthesizeSendsFishAudioRequestAndWritesAudio(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/tts" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if r.Header.Get("Authorization") != "Bearer fish-key" {
			t.Fatalf("authorization = %q", r.Header.Get("Authorization"))
		}
		if r.Header.Get("model") != "s2.1-pro-free" {
			t.Fatalf("model = %q", r.Header.Get("model"))
		}
		var request map[string]any
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if request["text"] != "សួស្តី" {
			t.Fatalf("text = %#v", request["text"])
		}
		if request["reference_id"] != "ref-7" {
			t.Fatalf("reference_id = %#v", request["reference_id"])
		}
		if request["format"] != "mp3" {
			t.Fatalf("format = %#v", request["format"])
		}
		prosody, ok := request["prosody"].(map[string]any)
		if !ok || prosody["speed"] != 1.15 {
			t.Fatalf("prosody = %#v", request["prosody"])
		}
		_, _ = w.Write([]byte("ID3-test-audio"))
	}))
	defer server.Close()

	output := filepath.Join(t.TempDir(), "speech.mp3")
	client := NewTtsClient(server.URL, "fish-key", "", "")
	if err := client.Synthesize(context.Background(), types.TTSSpeechOptions{
		Text:       "សួស្តី",
		Voice:      "ref-7",
		OutputFile: output,
		Format:     "mp3",
		Speed:      1.15,
	}); err != nil {
		t.Fatalf("synthesize: %v", err)
	}
	content, err := os.ReadFile(output)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if string(content) != "ID3-test-audio" {
		t.Fatalf("output = %q", string(content))
	}
}

func TestSynthesizeWavOmitsProsodyAtOne(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request map[string]any
		_ = json.NewDecoder(r.Body).Decode(&request)
		if request["format"] != "wav" {
			t.Fatalf("format = %#v", request["format"])
		}
		if _, exists := request["prosody"]; exists {
			t.Fatalf("prosody = %#v, want omitted at speed 1", request["prosody"])
		}
		_, _ = w.Write([]byte("RIFF"))
	}))
	defer server.Close()

	client := NewTtsClient(server.URL, "fish-key", "s2.1-pro-free", "")
	if err := client.Synthesize(context.Background(), types.TTSSpeechOptions{
		Text:       "text",
		Voice:      "ref-7",
		OutputFile: filepath.Join(t.TempDir(), "segment.wav"),
	}); err != nil {
		t.Fatalf("synthesize: %v", err)
	}
}

func TestSynthesizeRequiresAPIKeyAndVoice(t *testing.T) {
	client := NewTtsClient("", "", "", "")
	if err := client.Synthesize(context.Background(), types.TTSSpeechOptions{Voice: "ref-7"}); err == nil || !strings.Contains(err.Error(), "api key is empty") {
		t.Fatalf("error = %v, want empty api key error", err)
	}
	keyed := NewTtsClient("", "fish-key", "", "")
	if err := keyed.Synthesize(context.Background(), types.TTSSpeechOptions{OutputFile: filepath.Join(t.TempDir(), "out.mp3")}); err == nil || !strings.Contains(err.Error(), "voice is empty") {
		t.Fatalf("error = %v, want empty voice error", err)
	}
}

func TestListVoicesDedupesAndKeepsTtsModels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/model" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("self") == "true" {
			_, _ = w.Write([]byte(`{"items":[{"_id":"m1","title":"My Voice","languages":["km"],"type":"tts"},{"_id":"m2","title":"Shared","type":"tts"}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"items":[{"_id":"m2","title":"Popular","type":"tts"},{"_id":"m3","title":"Not speech","type":"asr"}]}`))
	}))
	defer server.Close()

	client := NewTtsClient(server.URL, "fish-key", "", "")
	voices, err := client.ListVoices(context.Background())
	if err != nil {
		t.Fatalf("list voices: %v", err)
	}
	if len(voices) != 2 {
		t.Fatalf("voices = %#v, want 2", voices)
	}
	if voices[0].Code != "m1" || voices[0].Kind != "custom" || voices[0].Language != "km" {
		t.Fatalf("first voice = %#v", voices[0])
	}
	if voices[1].Code != "m2" || voices[1].Kind != "custom" || voices[1].Name != "Shared" {
		t.Fatalf("second voice = %#v, want deduped to the first listing", voices[1])
	}
}
