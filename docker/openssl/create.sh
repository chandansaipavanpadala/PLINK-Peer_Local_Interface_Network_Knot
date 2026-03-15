#!/bin/sh

cnf_dir='/mnt/openssl/'
certs_dir='/etc/ssl/certs/'
openssl req -config ${cnf_dir}auraCA.cnf -new -x509 -days 1 -keyout ${certs_dir}auraCA.key -out ${certs_dir}auraCA.crt
openssl req -config ${cnf_dir}auraCert.cnf -new -out /tmp/aura-dev.csr -keyout ${certs_dir}aura-dev.key
openssl x509 -req -in /tmp/aura-dev.csr -CA ${certs_dir}auraCA.crt -CAkey ${certs_dir}auraCA.key -CAcreateserial -extensions req_ext -extfile ${cnf_dir}auraCert.cnf -sha512 -days 1 -out ${certs_dir}aura-dev.crt

exec "$@"