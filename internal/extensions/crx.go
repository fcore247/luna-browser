package extensions

import (
	"bytes"
	"crypto"
	"crypto/ecdsa"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/binary"
	"errors"
)

// CRX3 binds the package bytes to a developer key and the requested Chrome ID.
// Never accept a ZIP hidden behind an unverified CRX header.
func VerifyCRX(b []byte, want string) ([]byte, error) {
	bad := errors.New("CRX-Signatur oder Erweiterungs-ID ist ungültig (CRX3 erforderlich)")
	if len(b) < 12 || !bytes.Equal(b[:4], []byte("Cr24")) || binary.LittleEndian.Uint32(b[4:8]) != 3 {
		return nil, bad
	}
	h := uint64(binary.LittleEndian.Uint32(b[8:12]))
	if h > 1<<20 || 12+h >= uint64(len(b)) {
		return nil, bad
	}
	fields, ok := protoFields(b[12 : 12+h])
	if !ok || len(fields[10000]) != 1 {
		return nil, bad
	}
	signed := fields[10000][0]
	sf, ok := protoFields(signed)
	if !ok || len(sf[1]) != 1 || len(sf[1][0]) != 16 {
		return nil, bad
	}
	rawID := sf[1][0]
	var id []byte
	for _, x := range rawID {
		id = append(id, 'a'+(x>>4), 'a'+(x&15))
	}
	if want != "" && string(id) != want {
		return nil, bad
	}
	payload := b[12+h:]
	hash := sha256.New()
	hash.Write([]byte("CRX3 SignedData\x00"))
	var size [4]byte
	binary.LittleEndian.PutUint32(size[:], uint32(len(signed)))
	hash.Write(size[:])
	hash.Write(signed)
	hash.Write(payload)
	digest := hash.Sum(nil)
	for _, tag := range []int{2, 3} {
		for _, proof := range fields[tag] {
			p, ok := protoFields(proof)
			if !ok || len(p[1]) != 1 || len(p[2]) != 1 {
				continue
			}
			keyBytes, sig := p[1][0], p[2][0]
			keyHash := sha256.Sum256(keyBytes)
			if !bytes.Equal(keyHash[:16], rawID) {
				continue
			}
			key, e := x509.ParsePKIXPublicKey(keyBytes)
			if e != nil {
				continue
			}
			valid := false
			switch k := key.(type) {
			case *rsa.PublicKey:
				valid = tag == 2 && rsa.VerifyPKCS1v15(k, crypto.SHA256, digest, sig) == nil
			case *ecdsa.PublicKey:
				valid = tag == 3 && ecdsa.VerifyASN1(k, digest, sig)
			}
			if valid {
				return payload, nil
			}
		}
	}
	return nil, bad
}

// Only protobuf's primitive wire types are needed for the small CRX3 header.
func protoFields(b []byte) (map[int][][]byte, bool) {
	f := map[int][][]byte{}
	for len(b) > 0 {
		key, n := binary.Uvarint(b)
		if n <= 0 || key>>3 == 0 {
			return nil, false
		}
		b = b[n:]
		switch key & 7 {
		case 2:
			size, n := binary.Uvarint(b)
			if n <= 0 || size > uint64(len(b)-n) {
				return nil, false
			}
			b = b[n:]
			f[int(key>>3)] = append(f[int(key>>3)], b[:size])
			b = b[size:]
		case 0:
			_, n := binary.Uvarint(b)
			if n <= 0 {
				return nil, false
			}
			b = b[n:]
		case 1:
			if len(b) < 8 {
				return nil, false
			}
			b = b[8:]
		case 5:
			if len(b) < 4 {
				return nil, false
			}
			b = b[4:]
		default:
			return nil, false
		}
	}
	return f, true
}

// Called only after VerifyCRX succeeded. Pin Chrome's runtime ID to the verified
// developer key rather than WebView2's installation directory.
func verifiedKey(b []byte) []byte {
	h := binary.LittleEndian.Uint32(b[8:12])
	fields, _ := protoFields(b[12 : 12+h])
	signed, _ := protoFields(fields[10000][0])
	id := signed[1][0]
	for _, tag := range []int{2, 3} {
		for _, raw := range fields[tag] {
			p, ok := protoFields(raw)
			if !ok || len(p[1]) != 1 {
				continue
			}
			sum := sha256.Sum256(p[1][0])
			if bytes.Equal(sum[:16], id) {
				return p[1][0]
			}
		}
	}
	return nil
}
