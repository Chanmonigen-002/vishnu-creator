package elevenlabs

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"vishnu-ai/internal/types"
)

const (
	DefaultScribeModel = "scribe_v1"
)

type TranscribeClient struct {
	BaseURL    string
	APIKey     string
	Model      string
	httpClient *http.Client
}

func NewTranscribeClient(baseURL, apiKey, model, proxy string) *TranscribeClient {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = DefaultElevenLabsBaseURL
	}
	if strings.TrimSpace(model) == "" {
		model = DefaultScribeModel
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if proxyURL, err := url.Parse(strings.TrimSpace(proxy)); err == nil && proxyURL.Scheme != "" {
		transport.Proxy = http.ProxyURL(proxyURL)
	}
	return &TranscribeClient{
		BaseURL: baseURL,
		APIKey:  strings.TrimSpace(apiKey),
		Model:   strings.TrimSpace(model),
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   elevenLabsTimeout,
		},
	}
}

type scribeWord struct {
	Text  string  `json:"text"`
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Type  string  `json:"type"`
}

type scribeResponse struct {
	Text         string       `json:"text"`
	LanguageCode string       `json:"language_code"`
	Words        []scribeWord `json:"words"`
}

func (c *TranscribeClient) Transcription(audioFile, language, workDir string) (*types.TranscriptionData, error) {
	if c.APIKey == "" {
		return nil, fmt.Errorf("ElevenLabs transcription requires an API key")
	}

	data, err := os.ReadFile(audioFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read audio file: %w", err)
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", filepath.Base(audioFile))
	if err != nil {
		return nil, fmt.Errorf("failed to create multipart form file: %w", err)
	}
	if _, err := part.Write(data); err != nil {
		return nil, fmt.Errorf("failed to write multipart form file: %w", err)
	}

	_ = writer.WriteField("model_id", c.Model)
	_ = writer.WriteField("tag_audio_events", "false")
	if strings.TrimSpace(language) != "" {
		lang := strings.TrimSpace(language)
		if lang == "km" {
			lang = "khm"
		}
		_ = writer.WriteField("language_code", lang)
	}
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("failed to close multipart writer: %w", err)
	}

	reqURL := fmt.Sprintf("%s/v1/speech-to-text", c.BaseURL)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, reqURL, body)
	if err != nil {
		return nil, fmt.Errorf("failed to create http request: %w", err)
	}
	req.Header.Set("xi-api-key", c.APIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ElevenLabs transcription request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ElevenLabs transcription failed (HTTP %d): %s", resp.StatusCode, string(respBytes))
	}

	var parsed scribeResponse
	if err := json.Unmarshal(respBytes, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse ElevenLabs response: %w", err)
	}

	result := &types.TranscriptionData{
		Language: parsed.LanguageCode,
		Text:     strings.TrimSpace(parsed.Text),
		Words:    make([]types.Word, 0, len(parsed.Words)),
	}

	num := 0
	for _, w := range parsed.Words {
		if w.Type == "audio_event" || strings.TrimSpace(w.Text) == "" {
			continue
		}
		result.Words = append(result.Words, types.Word{
			Num:   num,
			Text:  strings.TrimSpace(w.Text),
			Start: w.Start,
			End:   w.End,
		})
		num++
	}

	return result, nil
}
