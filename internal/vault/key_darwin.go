package vault

/*
#cgo LDFLAGS: -framework Security -framework CoreFoundation
#include <stdlib.h>
#include <Security/Security.h>
#include <CoreFoundation/CoreFoundation.h>

static CFMutableDictionaryRef lunaKeyQuery(const char *service, const char *account) {
	CFStringRef s = CFStringCreateWithCString(NULL, service, kCFStringEncodingUTF8);
	CFStringRef a = CFStringCreateWithCString(NULL, account, kCFStringEncodingUTF8);
	CFMutableDictionaryRef q = CFDictionaryCreateMutable(NULL, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
	CFDictionarySetValue(q, kSecClass, kSecClassGenericPassword);
	CFDictionarySetValue(q, kSecAttrService, s);
	CFDictionarySetValue(q, kSecAttrAccount, a);
	CFRelease(s);
	CFRelease(a);
	return q;
}

// Reads up to cap bytes. Returns the length, or a negative OSStatus (errSecItemNotFound = -25300).
static int lunaKeyGet(const char *service, const char *account, unsigned char *out, int cap) {
	CFMutableDictionaryRef q = lunaKeyQuery(service, account);
	CFDictionarySetValue(q, kSecReturnData, kCFBooleanTrue);
	CFDictionarySetValue(q, kSecMatchLimit, kSecMatchLimitOne);
	CFTypeRef result = NULL;
	OSStatus status = SecItemCopyMatching(q, &result);
	CFRelease(q);
	if (status != errSecSuccess || !result) return status == errSecSuccess ? -1 : (int)status;
	CFIndex n = CFDataGetLength((CFDataRef)result);
	int ret = (int)n;
	if (n > cap) ret = -2;
	else CFDataGetBytes((CFDataRef)result, CFRangeMake(0, n), out);
	CFRelease(result);
	return ret;
}

static int lunaKeySet(const char *service, const char *account, const char *label, const unsigned char *bytes, int len) {
	CFMutableDictionaryRef q = lunaKeyQuery(service, account);
	CFDataRef data = CFDataCreate(NULL, bytes, len);
	CFStringRef l = CFStringCreateWithCString(NULL, label, kCFStringEncodingUTF8);
	CFDictionarySetValue(q, kSecValueData, data);
	CFDictionarySetValue(q, kSecAttrLabel, l);
	// Never synchronised to iCloud, only readable while the Mac is unlocked.
	CFDictionarySetValue(q, kSecAttrSynchronizable, kCFBooleanFalse);
	CFDictionarySetValue(q, kSecAttrAccessible, kSecAttrAccessibleWhenUnlockedThisDeviceOnly);
	OSStatus status = SecItemAdd(q, NULL);
	CFRelease(l);
	CFRelease(data);
	CFRelease(q);
	return (int)status;
}

static int lunaKeyDelete(const char *service, const char *account) {
	CFMutableDictionaryRef q = lunaKeyQuery(service, account);
	OSStatus status = SecItemDelete(q);
	CFRelease(q);
	return (int)status;
}
*/
import "C"

import (
	"crypto/rand"
	"errors"
	"fmt"
	"unsafe"
)

const (
	keychainService = "com.luna.browser.vault"
	keychainAccount = "vault-key"
)

// DefaultKey returns the vault key from the macOS keychain, creating it on first use. The unsigned
// app may make macOS ask for the login password once after an update. That is the price of keeping
// the key out of reach of other programs.
func DefaultKey(string) KeyFunc { return keychainKey(keychainService, keychainAccount) }

func keychainKey(service, account string) KeyFunc {
	return func() ([]byte, error) {
		s, a := C.CString(service), C.CString(account)
		defer C.free(unsafe.Pointer(s))
		defer C.free(unsafe.Pointer(a))
		buf := make([]byte, 64)
		n := int(C.lunaKeyGet(s, a, (*C.uchar)(unsafe.Pointer(&buf[0])), C.int(len(buf))))
		if n == 32 {
			return buf[:32], nil
		}
		if n >= 0 {
			return nil, errors.New("Der Tresorschlüssel im Schlüsselbund ist beschädigt.")
		}
		if n != -25300 { // errSecItemNotFound
			return nil, fmt.Errorf("Der Schlüsselbund hat den Zugriff verweigert (Code %d).", n)
		}
		key := make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			return nil, err
		}
		label := C.CString("Luna Browser Passwort-Tresor")
		defer C.free(unsafe.Pointer(label))
		if status := int(C.lunaKeySet(s, a, label, (*C.uchar)(unsafe.Pointer(&key[0])), 32)); status != 0 {
			return nil, fmt.Errorf("Der Tresorschlüssel konnte nicht gespeichert werden (Code %d).", status)
		}
		return key, nil
	}
}

func deleteKeychainKey(service, account string) {
	s, a := C.CString(service), C.CString(account)
	defer C.free(unsafe.Pointer(s))
	defer C.free(unsafe.Pointer(a))
	C.lunaKeyDelete(s, a)
}
