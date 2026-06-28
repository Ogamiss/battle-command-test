# Battle Command

Première version jouable d'un jeu web multijoueur inspiré de la bataille navale, avec une carte mixte mer/terre.

## Fonctionnalités incluses

- Création d'une partie avec code à 6 caractères
- Rejoindre une partie à distance avec le code
- Noms de joueurs éditables
- Carte identique pour les deux joueurs
- Grille 10 × 5 : 6 colonnes mer et 4 colonnes terre
- Placement limité à 1 minute
- Placement automatique si un joueur ne valide pas à temps
- Unités obligatoires par joueur :
  - 1 porte-avion de 4 cases, uniquement dans l'eau
  - 2 bateaux militaires de 3 cases, uniquement dans l'eau
  - 2 tanks de 2 cases, uniquement sur terre
  - 2 militaires de 1 case, uniquement sur terre
- Combat tour par tour
- Détection touché / manqué / détruit
- Victoire quand toutes les unités adverses sont détruites

## Lancer le jeu en local

1. Installer Node.js 18 ou plus.
2. Ouvrir un terminal dans ce dossier.
3. Lancer :

```bash
npm install
npm start
```

4. Ouvrir :

```text
http://localhost:3000
```

Pour tester seul sur le même ordinateur, ouvrir deux onglets ou deux navigateurs.

## Jouer à distance

Pour jouer avec quelqu'un sur Internet, il faut héberger le serveur Node.js sur un service comme Render, Railway, Fly.io ou un VPS.

## Prochaines améliorations possibles

- Système de plusieurs cartes
- Images plus réalistes des unités
- Drag & drop au lieu du clic case par case
- Animations de tir et explosions
- Sons
- Chat entre joueurs
- Mode spectateur
- Comptes joueurs et historique des victoires
