package game

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func roomRequest(t *testing.T, manager *Manager, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(body))
	context.Request.Header.Set("Content-Type", "application/json")
	if path == "/api/rooms" {
		manager.CreateRoom(context)
	} else {
		manager.JoinRoom(context)
	}
	return recorder
}

func TestRoomTextLimitsRejectBeforeMutatingState(t *testing.T) {
	manager := NewManager()
	for _, tc := range []struct{ name, body, message string }{
		{"room too long unicode", `{"roomName":"` + strings.Repeat("界", 26) + `","playerName":"p1"}`, "房间名称长度无效"},
		{"player too long unicode", `{"roomName":"room","playerName":"` + strings.Repeat("🙂", 26) + `"}`, "玩家名称长度无效"},
		{"malformed utf8", string([]byte{'{', '"', 'r', 'o', 'o', 'm', 'N', 'a', 'm', 'e', '"', ':', '"', 0xff, '"', '}'}), "请求参数无效"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := roomRequest(t, manager, "/api/rooms", tc.body)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d", recorder.Code)
			}
			var response struct {
				Message string `json:"message"`
			}
			_ = json.Unmarshal(recorder.Body.Bytes(), &response)
			if response.Message != tc.message {
				t.Fatalf("message = %q", response.Message)
			}
			if len(manager.rooms) != 0 {
				t.Fatal("invalid request partially created a room")
			}
		})
	}
}

func TestRoomTextLimitsAcceptExactUnicodeBoundary(t *testing.T) {
	manager := NewManager()
	body := `{"roomName":"` + strings.Repeat("界", 25) + `","playerName":"` + strings.Repeat("🙂", 25) + `"}`
	if recorder := roomRequest(t, manager, "/api/rooms", body); recorder.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", recorder.Code, recorder.Body.String())
	}
}
