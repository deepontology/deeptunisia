---
translated_by: model-reviewed
---

{#intro}

DeepTunisia a été construit par une seule personne, avec un essaim d'assistants IA.

Cette phrase mérite un paragraphe, parce qu'elle est facile à mal lire.

## Une personne, de nombreux modèles {#what}

Le code, le pipeline de compilation, les validateurs, les vues carte et réseau, l'échafaudage de recherche — tout a été écrit en collaboration entre un humain et de nombreux modèles, travaillant en parallèle via OpenCode. À une semaine donnée, cela représentait des dizaines d'assistants simultanés, à travers plusieurs familles de modèles frontières, rédigeant, vérifiant et révisant les mêmes fichiers.

C'est pour cela que ce projet existe à cette échelle. Une seule personne ne livre pas un graphe de connaissances, un moteur de rendu temporel, un instrument trilingue et une compilation à exigences de preuve sans ce levier. Cela aurait été impossible autrement.

Et c'est toujours une seule personne qui décide. L'essaim ne tourne pas seul, il ne surveille pas l'actualité et il ne publie pas.

## Le papier : l'épistémologie est le compilateur {#paper}

L'idée est posée dans le [document de recherche](/deeptunisia-paper-v0_1-release.pdf) lié depuis la page d'accueil — *The Epistemology Is the Compiler*.

Sa thèse est simple : demander à des éditeurs de se souvenir d'une politique de preuve n'est pas l'appliquer. Alors ce projet compile la politique à la place.

Chaque affirmation dans le jeu de données porte sa preuve avec elle — source, provenance, quel type d'affirmation c'est (`documented` | `reported` | `inferred` | `unsubstantiated`), et là où c'est nécessaire qui la formule et ce qui la falsifierait. La compilation refuse tout ce qui arrive sans cette enveloppe :

- une inférence sans le raisonnement et le falsificateur
- une affirmation de faible confiance sans nommer qui la porte
- une affirmation sans source
- une date impossible
- une affirmation d'influence qui ne s'ancre à rien de documenté

Ce n'est pas une recommandation. La compilation échoue. Un candidat qui manque à ces exigences est rejeté à l'entrée et ne fusionne jamais. Le papier appelle cette propriété *« le jeu de données ne peut pas être silencieusement faux »* — non pas qu'il ne puisse pas être factuellement faux, mais qu'il ne peut pas violer silencieusement son propre contrat déclaré.

Le papier est la forme figée et citable. La forme vivante est le graphe lui-même et les pages qui le décrivent — [/methodology](/methodology) pour comment une affirmation est déposée, [/about](/about) pour combien a réellement été vérifié.

## Ce que l'essaim n'a pas fait {#not}

Aucune affirmation n'entre dans le graphe parce qu'un modèle l'a écrite.

[Investigate](/investigate) répond en traversant le graphe et en citant des enregistrements. Il ne génère pas de prose. Le rapprocheur du fil d'actualités relie un titre à une personne par correspondance de chaînes déterministe, jamais par un modèle de langage.

Trois endroits où les modèles touchent l'artefact, et chacun est étiqueté là où cela arrive :

- **Brouillons de traduction.** Le contenu marqué `translated_by: machine` ou `model-reviewed` a été produit par un modèle, avec un second passage modèle pour `model-reviewed`. Aucune personne lisant la langue ne l'a vu. Seul `human` signifie qu'une personne l'a fait. Les comptes par palier sont publiés sur [/about](/about) et jamais additionnés.
- **Candidats de recherche.** Les fichiers dans `data/contrib/` peuvent être rédigés avec l'assistance d'un LLM. Ce sont des propositions, pas des données, jusqu'à ce qu'un humain vérifie la source citée et l'affirmation, et les fusionne à travers la même porte que chaque autre édition emprunte.
- **Échafaudage et code.** L'application qui entoure a été co-écrite de la même façon. Le code est MIT ; les sources citées vers lesquelles pointe le graphe restent sous leurs propres conditions.

## La revue humaine peut être assistée par IA — reste humaine {#review}

Un humain qui relit un enregistrement peut utiliser une assistance IA pour le faire — pour comparer un décret à l'affirmation, pour faire apparaître une contradiction de dates, pour résumer une source, pour rédiger un falsificateur.

L'assistance ne change pas la règle : l'humain reste responsable du jugement. Le graphe enregistre qu'un humain l'a vérifié, quand, et comment (`method`, `date`) — sans publier de nom personnel sur l'enregistrement public. Une attribution plus complète vit dans le contrôle de version, de sorte que la vérification reste auditable sans exposer les contributeurs. La sortie du modèle n'entre jamais seule dans le graphe ; elle n'y rentre que comme candidate à travers la même porte que chaque autre édition emprunte, où la compilation la vérifie à nouveau.

## Pourquoi nous ne sur-affirmons pas {#why}

Deux chiffres expliquent la retenue :

- Seule une petite fraction des enregistrements a eu une revue humaine indépendante. Le chiffre exact est sur [/about](/about) ; il est délibérément peu flatteur, et ventilé par risque — les affirmations `unsubstantiated` et `inferred` restent proches de zéro.
- La plupart de la prose du jeu de données n'est pas encore traduite par un humain. Le texte analytique long n'est délibérément pas traduit à la machine, parce que la fluidité ne doit jamais se lire comme une vérification.

L'architecture affichée du projet est *les machines proposent, les humains vérifient*. La seconde moitié est celle qui porte. Presque rien n'est encore passé par une seconde paire d'yeux, et publier ce nombre est la seule façon pour que la première moitié veuille dire quelque chose.

## Comment le dire {#how}

- Chaque page de contenu vous dit son palier `translated_by` dans son en-tête.
- Chaque enregistrement vous dit sa `basis`, ses sources, et — pour `inferred` — le falsificateur.
- Chaque changement vous dit son diff. [/corrections](/corrections) est généré depuis le contrôle de version, non trié.

Si vous réutilisez le graphe, gardez la `basis` attachée à l'affirmation. Présenter un intervalle inféré comme une date, ou une affirmation `unsubstantiated` comme un résultat, dénature la source — quel que soit l'outil qui a aidé à rédiger le paragraphe autour.
