package handlers

import "testing"

func TestAppToken(t *testing.T) {
	token, err := AppToken()
	if err != nil {
		t.Error(err)
		return
	}
	t.Log(token)
}
