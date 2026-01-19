package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
)

var encryptionKey []byte

func InitCrypto() {
	keyHex := os.Getenv("ENCRYPTION_KEY")
	if keyHex == "" {
		keyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	}
	var err error
	encryptionKey, err = hex.DecodeString(keyHex)
	if err != nil {
		panic("Invalid ENCRYPTION_KEY")
	}
}

func HashToken(token string) string {
	h := sha256.New()
	h.Write([]byte(token))
	return hex.EncodeToString(h.Sum(nil))
}

func Decrypt(encryptedHex string, ivHex string) (string, error) {
	ciphertext, err := hex.DecodeString(encryptedHex)
	if err != nil {
		return "", err
	}
	nonce, err := hex.DecodeString(ivHex)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", err
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	// Open decrypts and authenticates. ciphertext includes tag.
	plaintext, err := aesgcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}

func Encrypt(plaintext string) (string, string, error) {
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", "", err
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", err
	}

	nonce := make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", "", err
	}

	// Seal appends tag to ciphertext
	ciphertext := aesgcm.Seal(nil, nonce, []byte(plaintext), nil)
	// Return Hex(Ciphertext), Hex(Nonce)
	return hex.EncodeToString(ciphertext), hex.EncodeToString(nonce), nil
}
