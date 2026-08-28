#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$ROOT_DIR/.cert"
LAN_IP="${EASYSAY_LAN_IP:?EASYSAY_LAN_IP is required}"
CA_KEY="$CERT_DIR/easysay-local-ca-key.pem"
CA_CERT="$CERT_DIR/easysay-local-ca.crt"
SERVER_KEY="$CERT_DIR/easysay-mobile-key.pem"
SERVER_CERT="$CERT_DIR/easysay-mobile-cert.pem"
SERVER_CSR="$CERT_DIR/easysay-mobile.csr"
CONFIG="$CERT_DIR/easysay-mobile-openssl.cnf"
CA_CONFIG="$CERT_DIR/easysay-local-ca-openssl.cnf"
CA_SERIAL="$CERT_DIR/easysay-local-ca.srl"
CA_REGENERATED=false

mkdir -p "$CERT_DIR"
chmod 700 "$CERT_DIR"

if [[ ! -f "$CA_KEY" || ! -f "$CA_CERT" ]] ||
  ! openssl x509 -in "$CA_CERT" -noout -text 2>/dev/null |
    grep -q "CA:TRUE"; then
  echo "Creating the EasySay local certificate authority..."
  cat >"$CA_CONFIG" <<EOF
[req]
prompt = no
distinguished_name = dn
x509_extensions = ca_ext

[dn]
CN = EasySay Local CA
O = EasySay

[ca_ext]
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
EOF
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes \
    -keyout "$CA_KEY" \
    -out "$CA_CERT" \
    -days 3650 \
    -config "$CA_CONFIG"
  chmod 600 "$CA_KEY"
  rm -f "$CA_SERIAL"
  CA_REGENERATED=true
fi

if [[ "$CA_REGENERATED" == false && -f "$SERVER_CERT" ]] &&
  openssl x509 -in "$SERVER_CERT" -noout -text |
    grep -q "IP Address:$LAN_IP"; then
  echo "Certificate already covers $LAN_IP"
  exit 0
fi

cat >"$CONFIG" <<EOF
[req]
prompt = no
distinguished_name = dn
req_extensions = server_ext

[dn]
CN = $LAN_IP
O = EasySay

[server_ext]
subjectAltName = @alt_names
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
IP.1 = $LAN_IP
IP.2 = 127.0.0.1
DNS.1 = localhost
EOF

echo "Creating the EasySay HTTPS certificate for $LAN_IP..."
openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$SERVER_KEY" \
  -out "$SERVER_CSR" \
  -config "$CONFIG"
openssl x509 -req -sha256 \
  -in "$SERVER_CSR" \
  -CA "$CA_CERT" \
  -CAkey "$CA_KEY" \
  -CAserial "$CA_SERIAL" \
  -CAcreateserial \
  -out "$SERVER_CERT" \
  -days 365 \
  -extfile "$CONFIG" \
  -extensions server_ext

chmod 600 "$SERVER_KEY"
rm -f "$SERVER_CSR"
