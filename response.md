root@server1:/home/sentra-live# cat -n /etc/nginx/sites-available/sentracoresystems.com.conf
     1  server {
     2    listen 80;
     3    server_name sentracoresystems.com;
     4
     5    location ^~ /.well-known/acme-challenge/ {
     6      root /var/www/certbot;
     7      default_type "text/plain";
     8    }
     9
    10    location / {
    11      return 301 http://sales.sentracoresystems.com$request_uri;
    12    }
    13  }
    14
    15  server {
    16    server_name sales.sentracoresystems.com;
    17
    18    client_max_body_size 25m;
    19
    20    location ^~ /.well-known/acme-challenge/ {
    21      root /var/www/certbot;
    22      default_type "text/plain";
    23    }
    24
    25    location / {
    26      proxy_pass http://127.0.0.1:4300;
    27      proxy_http_version 1.1;
    28      proxy_set_header Host $host;
    29      proxy_set_header X-Real-IP $remote_addr;
    30      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    31      proxy_set_header X-Forwarded-Proto $scheme;
    32    }
    33
    34      listen 443 ssl; # managed by Certbot
    35      ssl_certificate /etc/letsencrypt/live/api.sentracoresystems.com/fullchain.pem; # managed by Certbot
    36      ssl_certificate_key /etc/letsencrypt/live/api.sentracoresystems.com/privkey.pem; # managed by Certbot
    37      include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    38      ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
    39
    40  }
    41
    42  server {
    43    server_name pm2.sentracoresystems.com;
    44
    45    client_max_body_size 25m;
    46
    47    location ^~ /.well-known/acme-challenge/ {
    48      root /var/www/certbot;
    49      default_type "text/plain";
    50    }
    51
    52    location / {
    53      proxy_pass http://127.0.0.1:4301;
    54      proxy_http_version 1.1;
    55      proxy_set_header Host $host;
    56      proxy_set_header X-Real-IP $remote_addr;
    57      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    58      proxy_set_header X-Forwarded-Proto $scheme;
    59    }
    60
    61      listen 443 ssl; # managed by Certbot
    62      ssl_certificate /etc/letsencrypt/live/api.sentracoresystems.com/fullchain.pem; # managed by Certbot
    63      ssl_certificate_key /etc/letsencrypt/live/api.sentracoresystems.com/privkey.pem; # managed by Certbot
    64      include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    65      ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
    66
    67  }
    68
    69  server {
    70    server_name hrms.sentracoresystems.com;
    71
    72    client_max_body_size 25m;
    73
    74    location ^~ /.well-known/acme-challenge/ {
    75      root /var/www/certbot;
    76      default_type "text/plain";
    77    }
    78
    79    location / {
    80      proxy_pass http://127.0.0.1:4302;
    81      proxy_http_version 1.1;
    82      proxy_set_header Host $host;
    83      proxy_set_header X-Real-IP $remote_addr;
    84      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    85      proxy_set_header X-Forwarded-Proto $scheme;
    86    }
    87
    88      listen 443 ssl; # managed by Certbot
    89      ssl_certificate /etc/letsencrypt/live/api.sentracoresystems.com/fullchain.pem; # managed by Certbot
    90      ssl_certificate_key /etc/letsencrypt/live/api.sentracoresystems.com/privkey.pem; # managed by Certbot
    91      include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    92      ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
    93
    94  }
    95
    96  server {
    97    server_name api.sentracoresystems.com;
    98
    99    client_max_body_size 50m;
   100
   101    location ^~ /.well-known/acme-challenge/ {
   102      root /var/www/certbot;
   103      default_type "text/plain";
   104    }
   105
   106    location /socket.io-comm/ {
   107      proxy_pass http://127.0.0.1:3102;
   108      proxy_http_version 1.1;
   109      proxy_set_header Upgrade $http_upgrade;
   110      proxy_set_header Connection "upgrade";
   111      proxy_set_header Host $host;
   112      proxy_set_header X-Real-IP $remote_addr;
   113      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   114      proxy_set_header X-Forwarded-Proto $scheme;
   115    }
   116
   117    location /socket.io-pm/ {
   118      proxy_pass http://127.0.0.1:3103;
   119      proxy_http_version 1.1;
   120      proxy_set_header Upgrade $http_upgrade;
   121      proxy_set_header Connection "upgrade";
   122      proxy_set_header Host $host;
   123      proxy_set_header X-Real-IP $remote_addr;
   124      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   125      proxy_set_header X-Forwarded-Proto $scheme;
   126    }
   127
   128    location /api/comm/ {
   129      proxy_pass http://127.0.0.1:3102;
   130      proxy_http_version 1.1;
   131      proxy_set_header Host $host;
   132      proxy_set_header X-Real-IP $remote_addr;
   133      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   134      proxy_set_header X-Forwarded-Proto $scheme;
   135    }
   136
   137    location /api/pm/ {
   138      proxy_pass http://127.0.0.1:3103;
   139      proxy_http_version 1.1;
   140      proxy_set_header Host $host;
   141      proxy_set_header X-Real-IP $remote_addr;
   142      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   143      proxy_set_header X-Forwarded-Proto $scheme;
   144    }
   145
   146    location /api/hrms/ {
   147      proxy_pass http://127.0.0.1:3104;
   148      proxy_http_version 1.1;
   149      proxy_set_header Host $host;
   150      proxy_set_header X-Real-IP $remote_addr;
   151      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   152      proxy_set_header X-Forwarded-Proto $scheme;
   153    }
   154
   155    location /api/ {
   156      proxy_pass http://127.0.0.1:3101;
   157      proxy_http_version 1.1;
   158      proxy_set_header Host $host;
   159      proxy_set_header X-Real-IP $remote_addr;
   160      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   161      proxy_set_header X-Forwarded-Proto $scheme;
   162    }
   163
   164    location / {
   165      return 404;
   166    }
   167
   168      listen 443 ssl; # managed by Certbot
   169      ssl_certificate /etc/letsencrypt/live/api.sentracoresystems.com/fullchain.pem; # managed by Certbot
   170      ssl_certificate_key /etc/letsencrypt/live/api.sentracoresystems.com/privkey.pem; # managed by Certbot
   171      include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
   172      ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
   173
   174  }
   175
   176
   177  server {
   178      if ($host = sales.sentracoresystems.com) {
   179          return 301 https://$host$request_uri;
   180      } # managed by Certbot
   181
   182
   183    listen 80;
   184    server_name sales.sentracoresystems.com;
   185      return 404; # managed by Certbot
   186
   187
   188  }
   189
   190  server {
   191      if ($host = api.sentracoresystems.com) {
   192          return 301 https://$host$request_uri;
   193      } # managed by Certbot
   194
   195
   196    listen 80;
   197    server_name api.sentracoresystems.com;
   198      return 404; # managed by Certbot
   199
   200
   201  }
   202
   203  server {
   204      if ($host = pm2.sentracoresystems.com) {
   205          return 301 https://$host$request_uri;
   206      } # managed by Certbot
   207
   208
   209    listen 80;
   210    server_name pm2.sentracoresystems.com;
   211      return 404; # managed by Certbot
   212
   213
   214  }
   215
   216  server {
   217      if ($host = hrms.sentracoresystems.com) {
   218          return 301 https://$host$request_uri;
   219      } # managed by Certbot
   220
   221
   222    listen 80;
   223    server_name hrms.sentracoresystems.com;
   224      return 404; # managed by Certbot
   225
   226
   227  }root@server1:/home/sentra-live#
