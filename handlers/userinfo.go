package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"github.com/kiali/kiali/log"
	"net/http"
)

var (
	appToken  string
	adminUser map[string]struct{}
)

func init() {
	t, err := AppToken()
	if err != nil {
		panic(err)
	}
	appToken = t
	adminUser = map[string]struct{}{
		"yangchun": {},
		"cangfeng": {},
	}
}

type UserInfo struct {
	Username     string `json:"username"`
	Mail         string `json:"mail"`
	Identity     string `json:"identity"`
	IdentityName string `json:"identityName"`
}

type UserTokenInfo struct {
	TokenType   string `json:"tokenType"`
	ExpiresIn   int    `json:"expiresIn"`
	AccessToken string `json:"accessToken"`
}

func AppToken() (string, error) {
	domainUrl := "https://prod-auth-dapp.apps.hub.l2s4.p1.dian-sit.com"
	type ReqBodyStu struct {
		AppId     string `json:"appId"`
		AppSecret string `json:"appSecret"`
		GrantType string `json:"grantType"`
	}
	type RespBodyStu struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			TokenType   string `json:"tokenType"`
			ExpiresIn   int    `json:"expiresIn"`
			AccessToken string `json:"accessToken"`
		}
		Success bool `json:"success"`
	}
	reqBody := ReqBodyStu{
		AppId:     "cli_b47d9a36150443d3a425c10cdcfd594f",
		AppSecret: "QXeKdipSY5fsLvHW8HPXkZURS1MjX85q",
		GrantType: "client_credentials",
	}
	responseBody := RespBodyStu{}
	b, _ := json.Marshal(reqBody)
	response, err := http.Post(domainUrl+"/open-api/v1/client/token", "application/json", bytes.NewBuffer(b))
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	err = json.NewDecoder(response.Body).Decode(&responseBody)
	if err != nil {
		return "", err
	}
	if responseBody.Code != 0 {
		return "", errors.New("get app token error: " + responseBody.Msg)
	}
	return responseBody.Data.AccessToken, nil
}

func getUserToken(Code string) (*UserTokenInfo, error) {
	domainUrl := "https://prod-auth-dapp.apps.hub.l2s4.p1.dian-sit.com"
	type ReqBodyStu struct {
		Code      string `json:"code"`
		GrantType string `json:"grantType"`
	}
	type RespBodyStu struct {
		Code int           `json:"code"`
		Msg  string        `json:"msg"`
		Data UserTokenInfo `json:"data"`
	}
	reqBody := ReqBodyStu{
		Code:      Code,
		GrantType: "authorization_code",
	}

	responseBody := RespBodyStu{}

	b, _ := json.Marshal(reqBody)
	req, err := http.NewRequest("POST", domainUrl+"/open-api/v1/token", bytes.NewBuffer(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+appToken)
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	err = json.NewDecoder(response.Body).Decode(&responseBody)
	if err != nil {
		return nil, err
	}

	if responseBody.Code != 0 {
		log.Warning("get user token error: ", responseBody)
		return nil, errors.New("get user token error")
	}
	return &responseBody.Data, nil
}

func getUserInfo(token string) (*UserInfo, error) {
	domainUrl := "https://prod-auth-dapp.apps.hub.l2s4.p1.dian-sit.com"
	type RespBodyStu struct {
		Code int      `json:"code"`
		Msg  string   `json:"msg"`
		Data UserInfo `json:"data"`
	}
	responseBody := RespBodyStu{}

	req, err := http.NewRequest("GET", domainUrl+"/open-api/v1/userinfo", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", token)
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	err = json.NewDecoder(response.Body).Decode(&responseBody)
	if err != nil {
		return nil, err
	}

	if responseBody.Code != 0 {
		log.Warningf("response err: %v,%v", responseBody, token)
		return nil, errors.New("get user info error")
	}
	return &responseBody.Data, nil
}

func IsAdminUser(username string) bool {
	_, ok := adminUser[username]
	return ok
}

func IsDeveloperUser(username string) bool {
	return true
}
