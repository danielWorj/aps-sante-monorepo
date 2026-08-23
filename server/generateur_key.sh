#!/usr/bin/env bash
# generer_cles_jwt.sh
# Génère une paire de clés JWT (RS256 ou ES256) via OpenSSL.
# Compatible Git Bash (Windows), Linux, macOS.

set -euo pipefail

echo "============================================"
echo "  Génération des clés JWT (RS256 / ES256)"
echo "============================================"
echo

# --- Vérifie qu'openssl est disponible ---
if ! command -v openssl >/dev/null 2>&1; then
    echo "[ERREUR] \"openssl\" est introuvable dans le PATH."
    echo "Installez Git for Windows (https://git-scm.com/download/win)"
    echo "ou OpenSSL (https://slproweb.com/products/Win32OpenSSL.html)"
    echo "puis relancez ce script."
    exit 1
fi

# --- Choix de l'algorithme ---
echo "Quel algorithme voulez-vous utiliser ?"
echo "  1. ES256  (recommandé : clés/tokens plus courts, plus rapide)"
echo "  2. RS256  (RSA, plus répandu / compatibilité maximale)"
echo
read -rp "Votre choix (1 ou 2) : " CHOIX

case "$CHOIX" in
    1) ALGO="ES256" ;;
    2) ALGO="RS256" ;;
    *)
        echo "Choix invalide."
        exit 1
        ;;
esac

# --- Préfixe des fichiers ---
read -rp "Préfixe des fichiers de clé (défaut: jwt_access) : " PREFIXE
PREFIXE="${PREFIXE:-jwt_access}"

# --- Dossier de sortie ---
DOSSIER="keys"
mkdir -p "$DOSSIER"

PRIVEE="$DOSSIER/${PREFIXE}_private.pem"
PUBLIQUE="$DOSSIER/${PREFIXE}_public.pem"

# --- Vérifie l'écrasement éventuel ---
if [[ -f "$PRIVEE" ]]; then
    echo
    echo "[ATTENTION] $PRIVEE existe déjà."
    read -rp "Écraser les clés existantes ? (o/n) : " CONFIRME
    if [[ ! "$CONFIRME" =~ ^[oOyY]$ ]]; then
        echo "Annulé."
        exit 0
    fi
fi

echo
echo "Génération en cours ($ALGO)..."
echo

if [[ "$ALGO" == "ES256" ]]; then
    openssl ecparam -genkey -name prime256v1 -noout -out "$PRIVEE"
    openssl ec -in "$PRIVEE" -pubout -out "$PUBLIQUE"
else
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$PRIVEE"
    openssl rsa -pubout -in "$PRIVEE" -out "$PUBLIQUE"
fi

chmod 600 "$PRIVEE" 2>/dev/null || true

echo
echo "============================================"
echo "  Clés générées avec succès !"
echo "============================================"
echo "  Clé privée  : $PRIVEE"
echo "  Clé publique: $PUBLIQUE"
echo
echo "Ajoutez ceci à votre fichier .env :"
echo
echo "JWT_ACCESS_ALGORITHM=\"$ALGO\""
echo "JWT_ACCESS_PRIVATE_KEY_PATH=\"./$PRIVEE\""
echo "JWT_ACCESS_PUBLIC_KEY_PATH=\"./$PUBLIQUE\""
echo
echo "[IMPORTANT] N'ajoutez JAMAIS $PRIVEE à git."
echo "Ajoutez cette ligne à votre .gitignore :"
echo "  $DOSSIER/${PREFIXE}_private.pem"
echo