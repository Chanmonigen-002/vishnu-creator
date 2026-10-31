package whispercpp

import (
	"testing"
)

func TestWhispercppProgressWriter(t *testing.T) {
	var reported []int
	writer := newWhispercppProgressWriter(func(percent int) {
		reported = append(reported, percent)
	})

	chunks := []string{
		"whisper_print_progress_callback: progress =  15%\n",
		"some other log line\n",
		"whisper_print_progress_callback: progress =  30%\n",
		"whisper_print_progress_callback: progress =  75%\n",
		"whisper_print_progress_callback: progress = 100%\n",
	}

	for _, chunk := range chunks {
		_, err := writer.Write([]byte(chunk))
		if err != nil {
			t.Fatalf("unexpected write error: %v", err)
		}
	}

	expected := []int{15, 30, 75, 100}
	if len(reported) != len(expected) {
		t.Fatalf("expected %d progress updates, got %d: %v", len(expected), len(reported), reported)
	}
	for i, v := range expected {
		if reported[i] != v {
			t.Errorf("at index %d: expected %d, got %d", i, v, reported[i])
		}
	}
}
