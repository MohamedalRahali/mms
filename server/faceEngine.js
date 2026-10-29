import fs from 'node:fs'
import path from 'node:path'

/**
 * Moteur de reconnaissance du visage, hébergé sur le serveur (aucun service extérieur, aucune image envoyée hors MMS).
 * Modèles prévus, sous licences libres : YuNet (détection, MIT), SFace (vecteur du visage, Apache 2.0), MiniFASNet
 * (détection de photo ou d'écran présentés à la caméra, Apache 2.0), exécutés avec onnxruntime-node.
 *
 * Tant que les modèles et la bibliothèque ne sont pas installés et vérifiés, le moteur est « non prêt » : la
 * vérification n'est exigée de personne (aucun compte ne peut être bloqué dehors).
 */

export const MODEL_FILES = ['face_detection_yunet_2023mar.onnx', 'face_recognition_sface_2021dec.onnx', 'minifasnet_v2.onnx']

export function makeEngine(root) {
  const dir = path.join(root, 'models', 'face')
  const missing = () => {
    const m = MODEL_FILES.filter((f) => !fs.existsSync(path.join(dir, f)))
    try {
      fs.accessSync(path.join(root, 'node_modules', 'onnxruntime-node'))
    } catch {
      m.push('onnxruntime-node')
    }
    return m
  }
  return {
    // L'analyse n'est branchée qu'après installation et essai des modèles : jusque-là, toujours « non prêt »
    ready: () => false,
    info: () => ({ ready: false, missing: missing() }),
    analyse: async () => {
      throw new Error('ENGINE')
    },
  }
}
