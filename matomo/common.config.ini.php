; <?php exit; ?> DO NOT REMOVE THIS LINE
; Reverse proxy (nginx TLS → container HTTP). Loaded in addition to config.ini.php.
[General]
assume_secure_protocol = 1
force_ssl = 1
proxy_client_headers[] = HTTP_X_FORWARDED_FOR
proxy_host_headers[] = HTTP_X_FORWARDED_HOST
