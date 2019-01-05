Change history
======

v1.8 (2019/01/02)
------

- Ajout de la variable REF_TMP_DIR
- Option de sortie de l'attente sur presence d'un fichier TARGET_JOB_SKIPFILE
- gestion des jobs absents de l'historique
- reecriture de certains messages d'erreur


v1.7 (2018/08/21)
------

- affichage detaille des erreurs API
- ajout possibilite de modifier FLOW_DAILY_START et _END via args ou variable d'environement
- verification de la presence des variabless
- MaJ usageSyntax
- repositionnement du lancement du plan a 15h 


v1.6 (2018/05/05)
------

- trim autour des valeurs des parametres project, group et job name. 
- Test de presence de / en fin de RD_JOB_SERVERURL.
- correction de la gestion de -softlink sur une exection recente.
- expiration de l'attente sur depassement heure de fin du plan


v1.5 (2018/01/06)
------

- ajout de la variable API_VERSION dans les appels curl pour faciliter les MaJ de l'api


v1.4 (2017/12/10)
------

- utilisation de l'API au lieu de rd-cli
- variables RD_JOB_* renommées en TARGET_JOB_*
- ajout d'un message apres chaque heure d'attente


v1.3 (2017/09/17)
------

- wait_timeout positionne sur 16h
- ajout de la variable DEPENDENCY_IGNORE et parametre correspondant sur la ligne de commande
- ajout de l'affichage du PID du script


v1.2 (2017/09/09)
------

- MaJ rdJob_GetLastExecValue : prise en compte du fix rd-cli avec gestion correcte de la date au format iso-8601 
- correction de -time_end
- sleep positionne sur 60s
- appel des commandes rd-cli via nice


v1.1 (2017/08/26)
------

- commentaires 
- corrections sur traitement de la ligne de commande


v1.0 (2017/07/09)
------

first version
