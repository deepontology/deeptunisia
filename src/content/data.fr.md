---
translated_by: model-reviewed
---

{#lede}

Le site web est une fenêtre ; le graphe de connaissances est le projet lui-même. Il est publié intégralement, pour que le raisonnement puisse être audité plutôt que cru sur parole. Libre d'utilisation avec mention de la source — si vous construisez dessus, citez DeepTunisia et les sources sous-jacentes.

Le graphe est publié sous [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (attribution seule — réutilisation libre, y compris commerciale, en conservant la mention). Le code qui le construit est sous licence MIT. Voyez `data/LICENSE` dans le dépôt pour ce que couvre chacune.

## Comment lire un enregistrement {#read}

Deux champs portent l'essentiel du poids épistémique. `basis` indique de quel type d'affirmation il s'agit : documenté, rapporté, déduit ou non étayé. L'intervalle porte quatre champs de dates plutôt que deux, parce que les archives de personnel historiques sont rarement précises et que les réduire à deux inventerait une certitude. `raw` préserve exactement ce qui a été saisi, pour que vous puissiez voir la différence entre une date de décret et une estimation.

Ici, `status: "last-verified"` signifie que le titulaire était confirmé en poste au 1er octobre 2025 et a fort bien pu continuer. Cela ne signifie pas qu'il est parti. Cette distinction est la différence entre un jeu de données et une supposition, et c'est pourquoi la Chronique dessine cette barre avec un bord droit estompé.

## Ce que dit le champ de vérification {#verification}

`verification` répond à une seule question : une personne a-t-elle ouvert la source et confirmé qu'elle dit ce que la fiche dit ? Les quatre valeurs veulent dire exactement ceci, partout dans le schéma, les exports et ces pages :

Avant la 1.0, le build écrivait `verified` sur toute fiche qui ne disait rien, si bien que les anciens fichiers marquaient des milliers de fiches comme vérifiées alors qu'aucune personne ne les avait ouvertes. C'est pourquoi l'état par défaut est désormais `unflagged` ; dans un fichier écrit avant la 1.0, `verified` signifie seulement que le fichier était muet.

Le `status: "last-verified"` montré ci-dessus est un autre champ. Il dit quand le titulaire a été confirmé en poste pour la dernière fois, non qu'une personne a contrôlé la fiche contre une source.

## Mises en garde à garder en tête {#caveats}

- **{needsPrimary} enregistrements attendent une source primaire.** Ils sont marqués. Ne citez pas un intervalle inféré comme une date.
- **{contradictions} contradictions restent non résolues.** Là où les sources divergent, le jeu de données consigne le désaccord au lieu de choisir. Vérifiez le tableau `disputes` avant d'utiliser un chiffre.
- **La chronologie de la police antérieure à 2011 est le point le plus faible.** La succession des chefs de la police nationale sous Ben Ali repose en grande partie sur des sources secondaires.
- **Les pondérations d'autorité sont éditoriales.** Elles relèvent d'un jugement sur l'autorité formelle, publié sur la [page Méthode](/methodology) pour que vous puissiez y substituer les vôtres.
- **{checkedByPerson} enregistrements ont été contrôlés par une personne, {passedByAgent} par un agent, et {unstated} portent une note de relecture qui ne dit pas qui l'a lue, sur {reviewable} ; les vérifications indépendantes restent à zéro.** Traitez le reste comme compilé mais non audité.

## Le reconstruire vous-même {#rebuild}

La source de vérité est le YAML, pas ce JSON. La compilation valide chaque référence, rejette toute affirmation sans source, rejette une inférence sans raisonnement énoncé ni réfutateur, rejette une affirmation à faible confiance non attribuée, et dérive toutes les chaînes de succession des enregistrements de postes afin que les trous apparaissent au lieu d'être lissés. Si elle compile, l'intégrité référentielle tient.
