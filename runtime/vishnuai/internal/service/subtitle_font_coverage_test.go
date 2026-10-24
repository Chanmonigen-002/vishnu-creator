package service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/image/font/sfnt"
)

func TestSubtitleFontCoverageResolvesMissingSimplifiedGlyphs(t *testing.T) {
	coverage := &subtitleFontCoverage{fonts: map[string]*sfnt.Font{}, families: []string{"VishnuCreator Rounded Bold", "VishnuCreator Sans Bold"}}
	for i, file := range []string{"VishnuCreatorRounded-Bold.ttf", "VishnuCreatorSans-Bold.ttf"} {
		data, err := os.ReadFile(filepath.Join("../../../../assets/creator-subtitle-fonts/desktop", file))
		if err != nil {
			t.Fatal(err)
		}
		font, err := sfnt.Parse(data)
		if err != nil {
			t.Fatal(err)
		}
		coverage.fonts[coverage.families[i]] = font
	}
	if coverage.has("VishnuCreator Rounded Bold", "长标") {
		t.Fatal("fixture must exercise missing glyphs")
	}
	actual := subtitleFallbackFontTags("长字幕，标点！", "VishnuCreator Rounded Bold", nil, coverage)
	if !strings.Contains(actual, `{\fnVishnuCreator Sans Bold}长`) || !strings.Contains(actual, `{\fnVishnuCreator Sans Bold}标`) {
		t.Fatalf("missing explicit fallback: %s", actual)
	}
	if !strings.Contains(actual, `{\fnVishnuCreator Rounded Bold}字幕，`) {
		t.Fatalf("available preset glyphs lost their font: %s", actual)
	}
}
