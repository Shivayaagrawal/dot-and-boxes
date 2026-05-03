package token

import (
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID   int    `json:"sub"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

var key = []byte(os.Getenv("TOKEN_KEY"))

func GenerateToken(userID int, username string) (string, error) {
	claims := Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "DnBoxes-Auth",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(2 * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	return token.SignedString(key)
}

// ParseSession validates a JWT from the DnB-Session cookie (HS256, same key as GenerateToken).
// Claims are available as jwt.MapClaims (e.g. "sub", "username") to match existing handlers.
func ParseSession(tokenString string) (*jwt.Token, error) {
	return jwt.ParseWithClaims(tokenString, jwt.MapClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method %v", t.Header["alg"])
		}
		return key, nil
	})
}
