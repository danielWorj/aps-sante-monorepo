# Apres avoir pull le code sur le VPS 

# 1- GENERATION DES KEYS 
mkdir -p keys
openssl genrsa -out keys/jwt_access_private.pem 2048
openssl rsa -in keys/jwt_access_private.pem -pubout -out keys/jwt_access_public.pem
chmod 600 keys/*.pem

mkdir -p keys
openssl ecparam -genkey -name prime256v1 -noout -out keys/jwt_access_private.pem
openssl ec -in keys/jwt_access_private.pem -pubout -out keys/jwt_access_public.pem
chmod 600 keys/*.pem

# 2- CORRIGER LES .env 

# 3- LANCER DOCKER 
docker compose build client-backoffice
docker compose build client-plateform
docker compose build server
docker compose up

# 4- Inspecter la BD
docker compose exec db psql -U <postgres_user> -d <postgres_db>

# 5- Roles et Referentiels , Specialite  
cf seed_referentiel.sql   / cf seed_specialite.sql

# 6- GENERER LE TOKEN POUR CREER LE SUPER ADMIN
openssl rand -hex 32

# 