# RefCheckID transfer archive

Encrypted handoff archive for the repository owner. The decryption key is supplied
separately in the setup chat and is not committed to Git.

Download without changing the current checkout:

```bash
git fetch origin codex/refcheckid-transfer-archive
git show FETCH_HEAD:refcheckid-transfer-20261110.zip.gpg > /tmp/refcheckid-transfer-20261110.zip.gpg
gpg --pinentry-mode loopback --output /workspaces/refcheckid-transfer-20261110.zip --decrypt /tmp/refcheckid-transfer-20261110.zip.gpg
```

Plain ZIP SHA-256:
`35537130cc2197610c66463d1b756c3536eeedd7c2f13864bb7ed0ee5dfe5b7e`

Verify the ZIP before extracting, then follow LEGGIMI.md inside it.
The application code branch is codex/refcheckid-runtime-transfer. This branch
contains only the encrypted archive and instructions; it is not an application checkout.
