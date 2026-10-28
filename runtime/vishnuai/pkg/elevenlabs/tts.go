package elevenlabs

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"vishnu-ai/internal/types"
)

// ElevenLabs text-to-speech. Endpoints and fields follow the official API
// reference (recorded in docs/providers/provider-research-2026-10.md).

const (
	DefaultElevenLabsBaseURL = "https://api.elevenlabs.io"
	DefaultElevenLabsModel   = "eleven_multilingual_v2"
	elevenLabsTimeout        = 10 * time.Minute
)

type TtsClient struct {
	BaseURL    string
	APIKey     string
	Model      string
	httpClient *http.Client
}

func NewTtsClient(baseURL, apiKey, model, proxy string) *TtsClient {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = DefaultElevenLabsBaseURL
	}
	if strings.TrimSpace(model) == "" {
		model = DefaultElevenLabsModel
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if proxyURL, err := url.Parse(strings.TrimSpace(proxy)); err == nil && proxyURL.Scheme != "" {
		transport.Proxy = http.ProxyURL(proxyURL)
	}
	return &TtsClient{
		BaseURL: baseURL,
		APIKey:  strings.TrimSpace(apiKey),
		Model:   strings.TrimSpace(model),
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   elevenLabsTimeout,
		},
	}
}

func (c *TtsClient) Text2Speech(text, voice, outputFile string) error {
	return c.Synthesize(context.Background(), types.TTSSpeechOptions{
		Text:       text,
		Voice:      voice,
		OutputFile: outputFile,
	})
}

func (c *TtsClient) Synthesize(ctx context.Context, options types.TTSSpeechOptions) error {
	if c.APIKey == "" {
		return fmt.Errorf("elevenlabs tts api key is empty")
	}
	voice := strings.TrimSpace(options.Voice)
	if voice == "" {
		return fmt.Errorf("elevenlabs tts voice is empty")
	}
	outputFormat := "mp3_44100_128"
	if speechFormat(options.Format, options.OutputFile) == "wav" {
		outputFormat = "wav_44100"
	}
	requestBody := map[string]any{
		"text":     options.Text,
		"model_id": c.Model,
	}
	speed := options.Speed
	if speed != 0 && speed != 1 {
		requestBody["voice_settings"] = map[string]any{"speed": speed}
	}
	body, err := json.Marshal(requestBody)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, elevenLabsTimeout)
	defer cancel()
	endpoint := fmt.Sprintf("%s/v1/text-to-speech/%s?output_format=%s", c.BaseURL, url.PathEscape(voice), outputFormat)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("xi-api-key", c.APIKey)
	req.Header.Set("Content-Type", "application/json")
	response, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
		return fmt.Errorf("elevenlabs tts returned HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(message)))
	}
	if err := os.MkdirAll(filepath.Dir(options.OutputFile), 0755); err != nil {
		return err
	}
	file, err := os.Create(options.OutputFile)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = io.Copy(file, io.LimitReader(response.Body, 100<<20))
	return err
}

func (c *TtsClient) ListVoices(ctx context.Context) ([]types.TTSVoice, error) {
	ctx, cancel := context.WithTimeout(ctx, elevenLabsTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/v2/voices?page_size=100", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("xi-api-key", c.APIKey)
	response, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
		return nil, fmt.Errorf("elevenlabs voice list returned HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(message)))
	}
	var payload struct {
		Voices []struct {
			VoiceID  string `json:"voice_id"`
			Name     string `json:"name"`
			Category string `json:"category"`
			Labels   struct {
				Gender   string `json:"gender"`
				Language string `json:"language"`
			} `json:"labels"`
		} `json:"voices"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 10<<20)).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode elevenlabs voices: %w", err)
	}
	voices := make([]types.TTSVoice, 0, len(payload.Voices))
	for _, entry := range payload.Voices {
		if entry.VoiceID == "" {
			continue
		}
		voice := types.TTSVoice{
			Code:     entry.VoiceID,
			Name:     entry.Name,
			Provider: "elevenlabs",
			Kind:     voiceKind(entry.Category),
		}
		if voice.Name == "" {
			voice.Name = entry.VoiceID
		}
		if entry.Labels.Language != "" {
			voice.Language = entry.Labels.Language
		}
		if entry.Labels.Gender != "" {
			voice.Gender = entry.Labels.Gender
		}
		voices = append(voices, voice)
	}
	return voices, nil
}

func voiceKind(category string) string {
	switch strings.TrimSpace(strings.ToLower(category)) {
	case "cloned", "professional":
		return "custom"
	case "generated":
		return "designed"
	default:
		return "builtin"
	}
}

func speechFormat(explicit, outputFile string) string {
	format := strings.ToLower(strings.TrimSpace(explicit))
	if format == "mp3" || format == "wav" {
		return format
	}
	if strings.EqualFold(filepath.Ext(outputFile), ".mp3") {
		return "mp3"
	}
	return "wav"
}
