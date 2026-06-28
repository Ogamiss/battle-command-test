# Battle Command V3

Jeu web tactique multijoueur inspiré de la bataille navale.

## Nouveautés V2
- Interface graphique beaucoup plus proche de la maquette militaire.
- Carte détaillée avec mer 6×5 et terre 4×5.
- Affichage visuel des unités placées.
- Animation plein écran à chaque tir : **TOUCHÉ**, **COULÉ**, **RATÉ**.
- Effet d'impact sur la case bombardée.
- Journal de bord amélioré.

## Installation locale

```bash
npm install
npm start
```

Puis ouvrir :

```txt
http://localhost:3000
```

## Déploiement
Ce projet est un serveur Node.js + Socket.IO. Il doit être hébergé sur un service compatible WebSockets comme Koyeb, Render, Fly.io ou un VPS.

Commandes à renseigner chez l'hébergeur :

- Build command : `npm install`
- Start command : `npm start`


## Nouveautés V3
- Mention “Créé par Les Grellet’s” sur l’écran d’accueil.
- Écran de victoire avec le nom du joueur gagnant.
- Résumé de partie avec tirs totaux, touches, ratés et unités coulées/détruites pour chaque joueur.
