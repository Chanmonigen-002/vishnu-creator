package whispercpp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"vishnu-ai/config"
	"vishnu-ai/internal/resourcepath"
	"vishnu-ai/internal/storage"
	"vishnu-ai/internal/types"
	"vishnu-ai/log"
	"vishnu-ai/pkg/util"
	"vishnu-ai/pkg/whisper"

	"go.uber.org/zap"
)

var whispercppProgressPattern = regexp.MustCompile(`progress\s*=\s*([0-9]{1,3})%`)

type whispercppProgressWriter struct {
	mu             sync.Mutex
	pending        string
	lastProgress   int
	reportProgress func(percent int)
}

func newWhispercppProgressWriter(reportProgress func(percent int)) *whispercppProgressWriter {
	return &whispercppProgressWriter{
		lastProgress:   -1,
		reportProgress: reportProgress,
	}
}

func (w *whispercppProgressWriter) Write(p []byte) (n int, err error) {
	if w.reportProgress == nil {
		return len(p), nil
	}
	w.mu.Lock()
	defer w.mu.Unlock()

	text := w.pending + string(p)
	for _, match := range whispercppProgressPattern.FindAllStringSubmatch(text, -1) {
		percent, err := strconv.Atoi(match[1])
		if err != nil || percent < 0 || percent > 100 || percent <= w.lastProgress {
			continue
		}
		w.lastProgress = percent
		w.reportProgress(percent)
	}
	const pendingLimit = 256
	if len(text) > pendingLimit {
		w.pending = text[len(text)-pendingLimit:]
	} else {
		w.pending = text
	}
	return len(p), nil
}

func (c *WhispercppProcessor) Transcription(audioFile, language, workDir string) (*types.TranscriptionData, error) {
	return c.TranscriptionWithProgress(audioFile, language, workDir, nil)
}

func (c *WhispercppProcessor) TranscriptionWithProgress(
	audioFile, language, workDir string,
	reportProgress func(percent int),
) (*types.TranscriptionData, error) {
	if err := c.ValidateLanguage(language); err != nil {
		return nil, err
	}
	language = types.WhisperLanguageCode(language)

	name := util.ChangeFileExtension(audioFile, "")
	modelPath, err := resourcepath.Resolve("models", "whispercpp", fmt.Sprintf("ggml-%s.bin", c.Model))
	if err != nil {
		return nil, err
	}

	threads := runtime.NumCPU()
	if threads > 12 {
		threads = 12
	}
	if threads < 1 {
		threads = 1
	}

	cmdArgs := []string{
		"-m", modelPath,
		"-t", strconv.Itoa(threads),
		"--output-json-full",
		"--split-on-word",
		"--no-fallback",
		"-mc", "0",
		"--language", language,
		"--output-file", name,
		"--file", audioFile,
	}
	if reportProgress != nil {
		cmdArgs = append(cmdArgs, "-pp")
	}
	if config.Conf.Transcribe.EnableGpuAcceleration {
		cmdArgs = append(cmdArgs, "--flash-attn")
	} else {
		cmdArgs = append(cmdArgs, "--no-flash-attn")
	}

	cmd := exec.Command(storage.WhispercppPath, cmdArgs...)
	log.GetLogger().Info("WhispercppProcessor转录开始", zap.String("cmd", cmd.String()))

	var output bytes.Buffer
	var writer io.Writer = &output
	if reportProgress != nil {
		writer = io.MultiWriter(&output, newWhispercppProgressWriter(reportProgress))
	}
	cmd.Stdout = writer
	cmd.Stderr = writer

	err = cmd.Run()
	outputStr := output.String()
	if err != nil && !strings.Contains(outputStr, "output_json: saving output to") {
		log.GetLogger().Error("WhispercppProcessor  cmd 执行失败", zap.String("output", outputStr), zap.Error(err))
		return nil, err
	}
	log.GetLogger().Info("WhispercppProcessor转录json生成完毕", zap.String("audio file", audioFile))

	var result types.WhispercppOutput
	fileData, err := os.Open(util.ChangeFileExtension(audioFile, ".json"))
	if err != nil {
		log.GetLogger().Error("WhispercppProcessor 打开json文件失败", zap.Error(err))
		return nil, err
	}
	defer fileData.Close()
	decoder := json.NewDecoder(fileData)
	if err = decoder.Decode(&result); err != nil {
		log.GetLogger().Error("WhispercppProcessor 解析json文件失败", zap.Error(err))
		return nil, err
	}

	var (
		transcriptionData types.TranscriptionData
		num               int
	)
	for _, segment := range result.Transcription {
		transcriptionData.Text += segment.Text
		for _, word := range segment.Tokens {
			fromSec, err := parseTimestampToSeconds(word.Timestamps.From)
			if err != nil {
				log.GetLogger().Error("解析开始时间失败", zap.Error(err))
				return nil, err
			}

			toSec, err := parseTimestampToSeconds(word.Timestamps.To)
			if err != nil {
				log.GetLogger().Error("解析结束时间失败", zap.Error(err))
				return nil, err
			}
			regex := regexp.MustCompile(`^\[.*\]$`)
			if regex.MatchString(word.Text) {
				continue
			} else {
				transcriptionData.Words = append(transcriptionData.Words, types.Word{
					Num:   num,
					Text:  word.Text,
					Start: fromSec,
					End:   toSec,
				})
				num++
			}
		}
	}
	log.GetLogger().Info("WhispercppProcessor转录成功")
	return &transcriptionData, nil
}

// 新增时间戳转换函数
func parseTimestampToSeconds(timeStr string) (float64, error) {
	parts := strings.Split(timeStr, ",")
	if len(parts) != 2 {
		return 0, fmt.Errorf("invalid timestamp format: %s", timeStr)
	}

	timePart := strings.Split(parts[0], ":")
	if len(timePart) != 3 {
		return 0, fmt.Errorf("invalid time format: %s", parts[0])
	}

	hours, _ := strconv.Atoi(timePart[0])
	minutes, _ := strconv.Atoi(timePart[1])
	seconds, _ := strconv.Atoi(timePart[2])
	milliseconds, _ := strconv.Atoi(parts[1])

	return float64(hours*3600+minutes*60+seconds) + float64(milliseconds)/1000, nil
}

func (c *WhispercppProcessor) ValidateLanguage(language string) error {
	if err := types.ValidateWhisperLanguage(language, c.Model); err != nil {
		return &whisper.TranscriptionError{Code: "creator_transcription_language_unsupported", Message: err.Error()}
	}
	return nil
}
