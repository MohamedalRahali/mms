# Modèles de la vérification faciale (التحقق بالوجه)

Fichiers vérifiés par leur empreinte SHA-256 au chargement (`server/faceEngine.js`) : un fichier modifié n'est pas utilisé.

| Fichier | Rôle | Source | Licence | SHA-256 |
|---|---|---|---|---|
| face_detection_yunet_2023mar.onnx | détection du visage et de 5 points | opencv/opencv_zoo, models/face_detection_yunet | MIT (Shiqi Yu) | 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4 |
| face_recognition_sface_2021dec.onnx | vecteur du visage (128 valeurs) | opencv/opencv_zoo, models/face_recognition_sface | Apache 2.0 | 0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79 |
| MiniFASNetV2.onnx | photo ou écran présenté à la caméra (classe 1 = vrai visage) | poids minivision-ai/Silent-Face-Anti-Spoofing (Apache 2.0), conversion ONNX yakhyo/face-anti-spoofing, release « weights » | Apache 2.0 | b32929adc2d9c34b9486f8c4c7bc97c1b69bc0ea9befefc380e4faae4e463907 |

Téléchargés le 29/10/2026 avec l'accord du client. La conversion ONNX de MiniFASNetV2 a été contrôlée sur les images
d'exemple officielles de minivision (images/sample) : F1 et F2 « fausses », T1 « vraie », comme le dépôt d'origine
(tests/faceEngine.test.js).
