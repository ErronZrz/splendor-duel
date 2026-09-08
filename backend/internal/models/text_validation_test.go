package models

import (
	"strings"
	"testing"
)

func TestFreeTextBoundariesUseUnicodeRunes(t *testing.T) {
	tests := []struct {
		name, value string
		max         int
		want        bool
	}{
		{"normal", "桌游", MaxRoomNameRunes, true},
		{"at maximum", strings.Repeat("界", MaxRoomNameRunes), MaxRoomNameRunes, true},
		{"over maximum", strings.Repeat("界", MaxRoomNameRunes+1), MaxRoomNameRunes, false},
		{"multi byte emoji", strings.Repeat("🙂", MaxChatMessageRunes), MaxChatMessageRunes, true},
		{"empty", "", MaxChatMessageRunes, false},
		{"malformed utf8", string([]byte{0xff}), MaxChatMessageRunes, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := validFreeText(tc.value, tc.max); got != tc.want {
				t.Fatalf("validFreeText() = %v, want %v", got, tc.want)
			}
		})
	}
}
