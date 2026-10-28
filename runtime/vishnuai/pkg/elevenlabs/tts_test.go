package elevenlabs

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

func TestSynthesizeSendsElevenLabsRequestAndWritesAudio(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/text-to-speech/voice-42" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("output_format") != "mp3_44100_128" {
			t.Fatalf("output_format = %q", r.URL.Query().Get("output_format"))
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if r.Header.Get("xi-api-key") != "eleven-key" {
			t.Fatalf("xi-api-key = %q", r.Header.Get("xi-api-key"))
		}
		var request map[string]any
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if request["text"] != "សួស្តី" {
			t.Fatalf("text = %#v", request["text"])
		}
		if request["model_id"] != "eleven_multilingual_v2" {
			t.Fatalf("model_id = %#v", request["model_id"])
		}
		settings, ok := request["voice_settings"].(map[string]any)
		if !ok || settings["speed"] != 1.15 {
			t.Fatalf("voice_settings = %#v", request["voice_settings"])
		}
		_, _ = w.Write([]byte("ID3-test-audio"))
	}))
	defer server.Close()

	output := filepath.Join(t.TempDir(), "speech.mp3")
	client := NewTtsClient(server.URL, "eleven-key", "", "")
	if err := client.Synthesize(context.Background(), types.TTSSpeechOptions{
		Text:       "សួស្តី",
		Voice:      "voice-42",
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

func TestSynthesizeWavOmitsSpeedAtOne(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("output_format") != "wav_44100" {
			t.Fatalf("output_format = %q", r.URL.Query().Get("output_format"))
		}
		var request map[string]any
		_ = json.NewDecoder(r.Body).Decode(&request)
		if _, exists := request["voice_settings"]; exists {
			t.Fatalf("voice_settings = %#v, want omitted at speed 1", request["voice_settings"])
		}
		_, _ = w.Write([]byte("RIFF"))
	}))
	defer server.Close()

	client := NewTtsClient(server.URL, "eleven-key", "eleven_multilingual_v2", "")
	if err := client.Synthesize(context.Background(), types.TTSSpeechOptions{
		Text:       "text",
		Voice:      "voice-42",
		OutputFile: filepath.Join(t.TempDir(), "segment.wav"),
	}); err != nil {
		t.Fatalf("synthesize: %v", err)
	}
}

func TestSynthesizeRequiresAPIKeyAndVoice(t *testing.T) {
	client := NewTtsClient("", "", "", "")
	if err := client.Synthesize(context.Background(), types.TTSSpeechOptions{Voice: "voice-42"}); err == nil || !strings.Contains(err.Error(), "api key is empty") {
		t.Fatalf("error = %v, want empty api key error", err)
	}
	keyed := NewTtsClient("", "eleven-key", "", "")
	if err := keyed.Synthesize(context.Background(), types.TTSSpeechOptions{OutputFile: filepath.Join(t.TempDir(), "out.mp3")}); err == nil || !strings.Contains(err.Error(), "voice is empty") {
		t.Fatalf("error = %v, want empty voice error", err)
	}
}

func TestListVoicesMapsCategoriesToKinds(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/voices" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("xi-api-key") != "eleven-key" {
			t.Fatalf("xi-api-key = %q", r.Header.Get("xi-api-key"))
		}
		_, _ = w.Write([]byte(`{"voices":[
			{"voice_id":"v1","name":"Alice","category":"generated","labels":{"gender":"female","language":"en"}},
			{"voice_id":"v2","name":"Bob","category":"cloned","labels":{}},
			{"voice_id":"v3","name":"Cara","category":"pretrained","labels":{"language":"km"}}
		]}`))
	}))
	defer server.Close()

	client := NewTtsClient(server.URL, "eleven-key", "", "")
	voices, err := client.ListVoices(context.Background())
	if err != nil {
		t.Fatalf("list voices: %v", err)
	}
	if len(voices) != 3 {
		t.Fatalf("voices = %#v, want 3", voices)
	}
	if voices[0].Kind != "designed" || voices[0].Language != "en" {
		t.Fatalf("first voice = %#v", voices[0])
	}
	if voices[1].Kind != "custom" {
		t.Fatalf("second voice = %#v", voices[1])
	}
	if voices[2].Kind != "builtin" || voices[2].Language != "km" {
		t.Fatalf("third voice = %#v", voices[2])
	}
}
