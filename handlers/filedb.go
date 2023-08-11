package handlers

import (
	"errors"
	"fmt"
	"os"
)

const dataDirPrefix = "/opt/kiali/db/previews"

func ReadReleasingConfigFile(name, namespace, objectType string) []byte {
	path := dataDirPrefix + "/" + namespace + "/" + objectType + "/" + name
	file, err := os.ReadFile(path)
	if err != nil {
		fmt.Println("read file", err)
		return nil
	}
	return file
}

func WriteFile(name, namespace, objectType string, buff []byte) error {
	dirPath := dataDirPrefix + "/" + namespace + "/" + objectType + "/"
	if !isExist(dirPath) {
		err := os.MkdirAll(dirPath, 0777)
		if err != nil {
			fmt.Println("mkdir", err)
			return err
		}
	}
	filePath := dirPath + name
	err := os.WriteFile(filePath, buff, 0777)
	if err != nil {
		fmt.Println("write file", err)
		return err
	}
	return nil
}

func isExist(path string) bool {
	_, err := os.Stat(path)
	if err != nil {
		if os.IsExist(err) {
			return true
		}
		if os.IsNotExist(err) {
			return false
		}
		fmt.Println(err)
		return false
	}
	return true
}

func RemoveFile(name, namespace, objectType string) error {
	path := dataDirPrefix + "/" + namespace + "/" + objectType + "/" + name
	if !isExist(path) {
		return errors.New("file not exist")
	}
	err := os.Remove(path)
	if err != nil {
		fmt.Println("remove file", err)
		return err
	}
	return nil
}
