import express from 'express';
import multer from 'multer';
import {
  initializeBucket,
  uploadFile,
  deleteFile
} from '../services/minioClient.js';

const router = express.Router();

// 配置 multer 用于处理文件上传
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB 限制
  }
});

const getUserId = (req) => req.userId;

/**
 * 初始化 MinIO Bucket（首次使用）
 * GET /api/minio/init
 */
router.get('/init', async (req, res) => {
  try {
    await initializeBucket();
    res.json({ 
      success: true, 
      message: 'MinIO Bucket 初始化成功' 
    });
  } catch (error) {
    console.error('MinIO 初始化错误:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * 统一文件上传接口
 * POST /api/minio/upload
 * 
 * multipart/form-data 上传
 * file: 文件字段（单个或多个）
 */
router.post('/upload', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: '没有上传文件'
      });
    }

    // 批量上传文件
    const results = [];
    
    for (const file of files) {
      const result = await processFile(file);
      results.push(result);
    }
    
    if (results.length === 1) {
      return res.json({
        success: true,
        ...results[0]
      });
    } else {
      return res.json({
        success: true,
        files: results
      });
    }
    
  } catch (error) {
    console.error('文件上传错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 处理单个文件上传
 */
async function processFile(file) {
  let originalName = file.originalname;
  
  // 转换编码
  try {
    const buffer = Buffer.from(originalName, 'latin1');
    originalName = buffer.toString('utf8');
  } catch (e) {
    console.warn('文件名编码转换失败，使用原始文件名:', e.message);
  }
  
  const mimeType = file.mimetype;
  // 根据文件类型确定存储路径
  let folder = 'others/';
  if (mimeType.startsWith('image/')) {
    folder = 'images/';
  } else if (mimeType === 'application/pdf' || 
             mimeType.includes('word') || 
             mimeType.includes('document')) {
    folder = 'documents/';
  }
  
  // 生成唯一的对象名称（原始文件名_时间戳.扩展名）
  const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
  const ext = originalName.split('.').pop() || getExtFromMimeType(mimeType);
  const timestamp = Date.now();
  const objectName = `${folder}${nameWithoutExt}_${timestamp}.${ext}`;
  // 上传到 MinIO
  const publicUrl = await uploadFile(file.buffer, objectName, mimeType);
  
  return {
    url: publicUrl,
    filename: originalName,
    size: file.size,
    mimeType: mimeType,
    objectName: objectName
  };
}

/**
 * 删除文件
 * DELETE /api/minio/delete
 * {
 *   "objectName": "images/xxx.jpg"
 * }
 */
router.delete('/delete', async (req, res) => {
  try {
    const { objectName } = req.body;
    
    if (!objectName) {
      return res.status(400).json({
        success: false,
        error: '缺少 objectName 参数'
      });
    }
    
    await deleteFile(objectName);
    
    res.json({
      success: true,
      message: '文件删除成功'
    });
    
  } catch (error) {
    console.error('文件删除错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 根据 MIME 类型获取扩展名
 */
function getExtFromMimeType(mimeType) {
  const mimeToExt = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
    'text/html': 'html',
    'text/markdown': 'md'
  };
  return mimeToExt[mimeType] || 'bin';
}

export default router;
