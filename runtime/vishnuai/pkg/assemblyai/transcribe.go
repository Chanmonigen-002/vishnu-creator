package assemblyai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"vishnu-ai/internal/types"
)

const (
	DefaultAssemblyAIBaseURL = "https://api.assemblyai.com"
	DefaultAssemblyAIModel   = "universal"
	assemblyAITimeout        = 10 * time.Minute
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
		baseURL = DefaultAssemblyAIBaseURL
	}
	if strings.TrimSpace(model) == "" {
		model = DefaultAssemblyAIModel
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
			Timeout:   assemblyAITimeout,
		},
	}
}

type uploadResponse struct {
	UploadURL string `json:"upload_url"`
}

type transcriptRequest struct {
	AudioURL     string `json:"audio_url"`
	LanguageCode string `json:"language_code,omitempty"`
}

type transcriptInitResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Error  string `json:"error"`
}

type assemblyAIWord struct {
	Text  string  `json:"text"`
	Start float64 `json:"start"` // milliseconds
	End   float64 `json:"end"`   // milliseconds
}

type transcriptPollResponse struct {
	ID           string           `json:"id"`
	Status       string           `json:"status"`
	Text         string           `json:"text"`
	LanguageCode string           `json:"language_code"`
	Words        []assemblyAIWord `json:"words"`
	Error        string           `json:"error"`
}

func (c *TranscribeClient) Transcription(audioFile, language, workDir string) (*types.TranscriptionData, error) {
	if c.APIKey == "" {
		return nil, fmt.Errorf("AssemblyAI transcription requires an API key")
	}

	data, err := os.ReadFile(audioFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read audio file: %w", err)
	}

	// 1. Upload audio file
	uploadURL := fmt.Sprintf("%s/v2/upload", c.BaseURL)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, uploadURL, bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("failed to create upload request: %w", err)
	}
	req.Header.Set("authorization", c.APIKey)
	req.Header.Set("Content-Type", "application/octet-stream")

	uploadResp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("AssemblyAI upload failed: %w", err)
	}
	defer uploadResp.Body.Close()

	uploadBytes, err := io.ReadAll(uploadResp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read upload response: %w", err)
	}
	if uploadResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("AssemblyAI upload failed (HTTP %d): %s", uploadResp.StatusCode, string(uploadBytes))
	}

	var up uploadResponse
	if err := json.Unmarshal(uploadBytes, &up); err != nil || up.UploadURL == "" {
		return nil, fmt.Errorf("invalid upload response from AssemblyAI: %s", string(uploadBytes))
	}

	// 2. Submit transcription job
	submitURL := fmt.Sprintf("%s/v2/transcript", c.BaseURL)
	subReqBody := transcriptRequest{
		AudioURL:     up.UploadURL,
		LanguageCode: strings.TrimSpace(language),
	}
	subJSON, err := json.Marshal(subReqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to encode transcript request: %w", err)
	}

	subReq, err := http.NewRequestWithContext(context.Background(), http.MethodPost, submitURL, bytes.NewReader(subJSON))
	if err != nil {
		return nil, fmt.Errorf("failed to create transcript request: %w", err)
	}
	subReq.Header.Set("authorization", c.APIKey)
	subReq.Header.Set("Content-Type", "application/json")

	subResp, err := c.httpClient.Do(subReq)
	if err != nil {
		return nil, fmt.Errorf("AssemblyAI transcript submit failed: %w", err)
	}
	defer subResp.Body.Close()

	subBytes, err := io.ReadAll(subResp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read transcript submit response: %w", err)
	}
	if subResp.StatusCode != http.StatusOK && subResp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("AssemblyAI submit failed (HTTP %d): %s", subResp.StatusCode, string(subBytes))
	}

	var subInit transcriptInitResponse
	if err := json.Unmarshal(subBytes, &subInit); err != nil || subInit.ID == "" {
		return nil, fmt.Errorf("invalid transcript submission response: %s", string(subBytes))
	}

	// 3. Poll for completion
	pollURL := fmt.Sprintf("%s/v2/transcript/%s", c.BaseURL, subInit.ID)
	pollOnce := func() (*types.TranscriptionData, bool, error) {
		pReq, err := http.NewRequestWithContext(context.Background(), http.MethodGet, pollURL, nil)
		if err != nil {
			return nil, false, fmt.Errorf("failed to create poll request: %w", err)
		}
		pReq.Header.Set("authorization", c.APIKey)

		pResp, err := c.httpClient.Do(pReq)
		if err != nil {
			return nil, false, nil // retry on transient error
		}
		defer pResp.Body.Close()

		pBytes, err := io.ReadAll(pResp.Body)
		if err != nil || pResp.StatusCode != http.StatusOK {
			return nil, false, nil
		}

		var polled transcriptPollResponse
		if err := json.Unmarshal(pBytes, &polled); err != nil {
			return nil, false, nil
		}

		if polled.Status == "completed" {
			result := &types.TranscriptionData{
				Language: polled.LanguageCode,
				Text:     strings.TrimSpace(polled.Text),
				Words:    make([]types.Word, 0, len(polled.Words)),
			}
			for i, w := range polled.Words {
				if strings.TrimSpace(w.Text) == "" {
					continue
				}
				// AssemblyAI start and end are in milliseconds
				result.Words = append(result.Words, types.Word{
					Num:   i,
					Text:  strings.TrimSpace(w.Text),
					Start: w.Start / 1000.0,
					End:   w.End / 1000.0,
				})
			}
			return result, true, nil
		}

		if polled.Status == "error" {
			return nil, true, fmt.Errorf("AssemblyAI transcription job failed: %s", polled.Error)
		}

		return nil, false, nil
	}

	// Try immediate poll first
	if data, done, err := pollOnce(); done {
		return data, err
	}

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	timeout := time.After(8 * time.Minute)

	for {
		select {
		case <-timeout:
			return nil, fmt.Errorf("AssemblyAI transcription timed out for job ID: %s", subInit.ID)
		case <-ticker.C:
			if data, done, err := pollOnce(); done {
				return data, err
			}
		}
	}
}
