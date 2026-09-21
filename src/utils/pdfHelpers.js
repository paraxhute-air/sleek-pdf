/**
 * pdfHelpers.js
 * 핵심 PDF 처리 로직 (pdf-lib 기반)
 * - PDF 페이지 분할
 * - 이미지 → PDF 페이지 변환
 * - 워터마크 / 오버레이 텍스트 삽입
 * - 최종 PDF 병합 및 생성
 */

import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// 폰트 캐시
let cachedFontBytes = null;

/**
 * 맑은 고딕 폰트를 로컬에서 로드합니다 (한글+영문 모두 지원, TTF 형식).
 */
async function loadFont() {
  if (cachedFontBytes) return cachedFontBytes;
  const response = await fetch('/fonts/malgun.ttf');
  if (!response.ok) throw new Error('폰트 로드 실패');
  cachedFontBytes = await response.arrayBuffer();
  return cachedFontBytes;
}

/**
 * PDF 문서에 폰트를 임베드합니다.
 * @param {PDFDocument} doc 
 * @param {string} fontFamily 
 * @param {object} textStyle { bold, italic }
 */
async function getFont(doc, fontFamily = 'malgun', textStyle = {}) {
  const { bold, italic } = textStyle;
  const fam = fontFamily.toLowerCase();

  // 1. Mono (Courier)
  if (fam === 'courier' || fam === 'code') {
    if (bold && italic) return await doc.embedFont(StandardFonts.CourierBoldOblique);
    if (bold) return await doc.embedFont(StandardFonts.CourierBold);
    if (italic) return await doc.embedFont(StandardFonts.CourierOblique);
    return await doc.embedFont(StandardFonts.Courier);
  }
  // 2. Sans (Helvetica)
  if (fam === 'helvetica' || fam === 'modern' || fam === 'arial') {
    if (bold && italic) return await doc.embedFont(StandardFonts.HelveticaBoldOblique);
    if (bold) return await doc.embedFont(StandardFonts.HelveticaBold);
    if (italic) return await doc.embedFont(StandardFonts.HelveticaOblique);
    return await doc.embedFont(StandardFonts.Helvetica);
  }
  // 3. Serif (Times)
  if (fam === 'times' || fam === 'classic') {
    if (bold && italic) return await doc.embedFont(StandardFonts.TimesRomanBoldItalic);
    if (bold) return await doc.embedFont(StandardFonts.TimesRomanBold);
    if (italic) return await doc.embedFont(StandardFonts.TimesRomanItalic);
    return await doc.embedFont(StandardFonts.TimesRoman);
  }
  // 4. Special
  if (fam === 'symbol') return await doc.embedFont(StandardFonts.Symbol);
  if (fam === 'zapfdingbats') return await doc.embedFont(StandardFonts.ZapfDingbats);

  // 5. Custom (Malgun / Nanum map to Malgun for now)
  // 기본/커스텀 폰트 (맑은 고딕 - 단일 weight)
  // 볼드/이탤릭 시뮬레이션은 draw 단계에서 처리
  const fontBytes = await loadFont();
  doc.registerFontkit(fontkit);
  return await doc.embedFont(fontBytes);
}

/**
 * PDF 파일을 개별 페이지로 분할합니다.
 * @param {ArrayBuffer} pdfBytes - PDF 파일의 바이트 데이터
 * @param {string} fileName - 원본 파일명
 * @param {Function} [onProgress] - 진행률 콜백 (현재, 전체)
 * @returns {Promise<Array<{id, pageBytes, sourceFile, pageIndex, width, height}>>}
 */
export async function splitPdfPages(pdfBytes, fileName, onProgress) {
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pageCount = srcDoc.getPageCount();
  const pages = [];

  for (let i = 0; i < pageCount; i++) {
    const newDoc = await PDFDocument.create();
    const [copiedPage] = await newDoc.copyPages(srcDoc, [i]);
    newDoc.addPage(copiedPage);

    const { width, height } = copiedPage.getSize();
    const bytes = await newDoc.save();

    pages.push({
      id: `${fileName}-page-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pageBytes: bytes,
      sourceFile: fileName,
      pageIndex: i,
      pageLabel: `${fileName} - ${i + 1}/${pageCount}`,
      width,
      height,
      rotation: 0,
    });
    
    if (onProgress) {
       onProgress(i + 1, pageCount);
    }
  }

  return pages;
}

/**
 * 이미지(JPG/PNG)를 단일 PDF 페이지로 변환합니다.
 * @param {ArrayBuffer} imageBytes - 이미지의 바이트 데이터
 * @param {string} fileName - 원본 파일명
 * @param {string} mimeType - MIME 타입 (image/jpeg, image/png)
 * @returns {Promise<{id, pageBytes, sourceFile, pageIndex, width, height}>}
 */
export async function imageToPdfPage(imageBytes, fileName, mimeType) {
  const pdfDoc = await PDFDocument.create();
  let image;

  if (mimeType === 'image/png') {
    image = await pdfDoc.embedPng(imageBytes);
  } else {
    image = await pdfDoc.embedJpg(imageBytes);
  }

  const { width, height } = image.scale(1);
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });

  const bytes = await pdfDoc.save();

  return {
    id: `${fileName}-img-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    pageBytes: bytes,
    sourceFile: fileName,
    pageIndex: 0,
    pageLabel: fileName,
    width,
    height,
    rotation: 0,
  };
}

/**
 * 여러 페이지를 하나의 PDF로 병합하고 오버레이(전체/개별)를 적용합니다.
 * @param {Array} pages - 페이지 데이터 배열
 * @param {Object} globalOverlay - 전체 오버레이 설정 (워터마크, 스탬프, 머리말/꼬리말)
 * @param {Object} pageOverlays - 페이지별 오버레이 설정 맵 (ID -> Config)
 */
export async function mergePagesWithOverlay(pages, globalOverlay = null, pageOverlays = {}) {
  const finalDoc = await PDFDocument.create();

  // 1. 페이지 병합
  for (const pageData of pages) {
    const srcDoc = await PDFDocument.load(pageData.pageBytes);
    const [copiedPage] = await finalDoc.copyPages(srcDoc, [0]);
    
    // Apply page-specific rotation if exists
    if (pageData.rotation) {
      copiedPage.setRotation(degrees(pageData.rotation));
    }
    
    finalDoc.addPage(copiedPage);
  }

  // 폰트 로드 Helper
  const fonts = {};
  const getFontForConfig = async (config) => {
     if (!config) return null;
     const key = `${config.fontFamily}-${config.textStyle?.bold}-${config.textStyle?.italic}`;
     if (fonts[key]) return fonts[key];
     const f = await getFont(finalDoc, config.fontFamily, config.textStyle);
     fonts[key] = f;
     return f;
  };

  // Courier for Stamps (Standard Font)
  const courierFont = await finalDoc.embedFont(StandardFonts.CourierBold);

  const totalPages = finalDoc.getPageCount();

  for (let i = 0; i < totalPages; i++) {
    const page = finalDoc.getPage(i);
    const pageData = pages[i];
    const pageId = pageData.id;
    const localOverlay = pageOverlays[pageId];

    // Page Rotation Awareness
    const pRot = page.getRotation().angle; // 0, 90, 180, 270
    const { width: pW, height: pH } = page.getSize();
    const isRotated = pRot === 90 || pRot === 270;
    const vW = isRotated ? pH : pW; // Visual Width
    const vH = isRotated ? pW : pH; // Visual Height

    /**
     * getFinalCoords
     * Transforms visual center coordinates, dimensions, and rotation 
     * into PDF coordinate system based on page rotation.
     */
    const getFinalCoords = (vCx, vCy, elW, elH, vAngle) => {
       const rad = (vAngle * Math.PI) / 180;
       const cos = Math.cos(rad);
       const sin = Math.sin(rad);
       const rx = (-elW / 2) * cos - (-elH / 2) * sin;
       const ry = (-elW / 2) * sin + (-elH / 2) * cos;
       const vx = vCx + rx;
       const vy = vCy + ry;

       let fx, fy, fr;
       if (pRot === 90) {
          fx = pW - vy;
          fy = vx;
          fr = vAngle + 90;
       } else if (pRot === 180) {
          fx = pW - vx;
          fy = pH - vy;
          fr = vAngle + 180;
       } else if (pRot === 270) {
          fx = vy;
          fy = pH - vx;
          fr = vAngle + 270;
       } else {
          fx = vx;
          fy = vy;
          fr = vAngle;
       }
       return { x: fx, y: fy, rotate: degrees(fr) };
    };

    /**
     * TEXT DRAWER HELPER
     */
    const drawTextOverlay = async (config, type) => {
       if (!config) return;
       const text = config.text || (type === 'watermark' ? 'Watermark' : 'Text');
       if (!text || !text.trim()) return;

       const font = await getFontForConfig(config);
       const fontSize = config.fontSize || 60;
       const widthOfText = font.widthOfTextAtSize(text, fontSize);
       // fontSize를 그대로 높이로 쓰면 폰트의 실제 ascent/descent 비율과 안 맞아
       // baseline이 미묘하게 어긋난다. pdf-lib가 제공하는 실제 폰트 메트릭을 사용한다.
       const ascentOfText = font.heightAtSize(fontSize, { descender: false });
       const heightOfText = font.heightAtSize(fontSize, { descender: true });
       const descentOfText = heightOfText - ascentOfText;

       const color = config.color ? rgb(config.color.r, config.color.g, config.color.b) : rgb(0.5,0.5,0.5);
       const opacity = config.opacity ?? 0.4;
       const angle = -(config.rotation ?? 0);

       // Visual Center Position
       let vCx, vCy;
       if (config.customX !== undefined && config.customX !== null) {
          vCx = vW * config.customX;
          vCy = vH * (1 - config.customY);
       } else {
          const pos = calculatePosition(config.position || 'middle-center', vW, vH, widthOfText, heightOfText, 24);
          vCx = pos.x + widthOfText / 2;
          vCy = pos.y + heightOfText / 2;
       }

       // baseline은 상자의 기하학적 중심이 아니라 (ascent-descent)/2 만큼 떨어진 지점이어야
       // 시각적 중심과 일치한다.
       const textCoords = getFinalCoords(vCx, vCy, widthOfText, ascentOfText - descentOfText, angle);

       const drawOpts = {
          x: textCoords.x,
          y: textCoords.y,
          size: fontSize,
          font,
          color,
          opacity, 
          rotate: textCoords.rotate,
       };

       const isStandard = ['courier','helvetica','times'].includes(config.fontFamily);
       const isItalic = config.textStyle?.italic && !isStandard;
       const isBold = config.textStyle?.bold && !isStandard;

       const finalDrawOpts = { ...drawOpts };
       if (isItalic) {
          finalDrawOpts.skew = { xAxis: -15, yAxis: 0 };
       }

       page.drawText(text, finalDrawOpts);

       // Bold Simulation
       if (isBold) {
          const offset = fontSize * 0.02;
          page.drawText(text, { ...finalDrawOpts, x: finalDrawOpts.x + offset });
       }
       
       // Underline
       if (config.textStyle?.underline) {
          const thickness = fontSize * 0.05;
          const lineW = widthOfText;
          const lineCenterY = vCy - (heightOfText * 0.4) - (fontSize * 0.1);
          const lineCoords = getFinalCoords(vCx, lineCenterY, lineW, thickness, angle);
          page.drawRectangle({
             x: lineCoords.x, y: lineCoords.y, width: lineW, height: thickness,
             color, opacity, rotate: lineCoords.rotate
          });
       }

       // Border (Padded Box)
       if (config.border) {
          const padY = fontSize * 0.12;
          const padX = fontSize * 0.25;
          const boxW = widthOfText + padX * 2;
          const boxH = heightOfText + padY * 2; 
          const boxCoords = getFinalCoords(vCx, vCy + (fontSize * 0.02), boxW, boxH, angle);
          
          page.drawRectangle({
             x: boxCoords.x, y: boxCoords.y, width: boxW, height: boxH,
             borderColor: color, borderWidth: fontSize * 0.05, 
             opacity: 0, borderOpacity: opacity, rotate: boxCoords.rotate
          });
       }
    };

    /**
     * IMAGE DRAWER HELPER
     */
    const drawImageOverlay = async (config) => {
       if (!config || !config.imageDataUrl) return;
       try {
          let embeddedImage;
          if (config.imageDataUrl.startsWith('data:image/png')) {
             embeddedImage = await finalDoc.embedPng(config.imageDataUrl);
          } else {
             embeddedImage = await finalDoc.embedJpg(config.imageDataUrl);
          }
          
          const scale = config.imageScale ?? 0.2;
          const opacity = config.imageOpacity ?? 1.0;
          const rotation = -(config.imageRotation ?? 0);
          const { width: imgW, height: imgH } = embeddedImage.scale(scale);
          
          let vCx, vCy;
          if (config.imageCustomX !== undefined && config.imageCustomX !== null) {
             vCx = vW * config.imageCustomX;
             vCy = vH * (1 - config.imageCustomY);
          } else {
             const pos = calculatePosition(config.imagePosition || 'middle-center', vW, vH, imgW, imgH, 24);
             vCx = pos.x + imgW/2;
             vCy = pos.y + imgH/2;
          }
          
          const imgCoords = getFinalCoords(vCx, vCy, imgW, imgH, rotation);
          
          page.drawImage(embeddedImage, {
             x: imgCoords.x, y: imgCoords.y, width: imgW, height: imgH,
             opacity, rotate: imgCoords.rotate
          });
       } catch (e) {
          console.error("Image Draw Error", e);
       }
    };

    /**
     * STAMP DRAWER HELPER
     */
    const drawStampOverlay = async (config) => {
       if (!config) return;
       const text = (config.stampText || 'CONFIDENTIAL').trim();
       if (!text) return;
       
       const sFont = await getFontForConfig({ fontFamily: 'malgun' });
       const fontSize = config.stampFontSize || 40;
       const widthOfText = sFont.widthOfTextAtSize(text, fontSize);
       const ascentOfText = sFont.heightAtSize(fontSize, { descender: false });
       const heightOfText = sFont.heightAtSize(fontSize, { descender: true });
       const descentOfText = heightOfText - ascentOfText;

       const colorVal = config.stampColor || { r: 0.8, g: 0.1, b: 0.1 };
       const color = rgb(colorVal.r, colorVal.g, colorVal.b);
       const opacity = config.stampOpacity ?? 0.8;
       const angle = -(config.stampRotation ?? -15);

       let vCx, vCy;
       if (config.stampCustomX !== undefined && config.stampCustomX !== null) {
           vCx = vW * config.stampCustomX;
           vCy = vH * (1 - config.stampCustomY);
       } else {
           const pos = calculatePosition(config.stampPosition || 'bottom-right', vW, vH, widthOfText, heightOfText, 24);
           vCx = pos.x + widthOfText/2;
           vCy = pos.y + heightOfText/2;
       }

       const textCoords = getFinalCoords(vCx, vCy, widthOfText, ascentOfText - descentOfText, angle);
       
       page.drawText(text, {
          x: textCoords.x, y: textCoords.y, size: fontSize,
          font: sFont, color, opacity, rotate: textCoords.rotate
       });
       
       if (config.stampBorder) {
          const pad = fontSize * 0.3;
          const boxW = widthOfText + pad * 2;
          const boxH = heightOfText + pad;
          const boxCoords = getFinalCoords(vCx, vCy, boxW, boxH, angle);
          page.drawRectangle({
             x: boxCoords.x, y: boxCoords.y, width: boxW, height: boxH,
             borderColor: color, borderWidth: 3, 
             opacity: 0, borderOpacity: opacity, rotate: boxCoords.rotate
          });
       }
    };

    // --- APPLY LAYERS (Bottom to Top) ---
    if (globalOverlay && globalOverlay.enabledModes?.includes('watermark')) {
       await drawTextOverlay(globalOverlay, 'watermark');
    }
    if (localOverlay && localOverlay.enabledModes?.includes('image')) {
       await drawImageOverlay(localOverlay);
    }
    if (localOverlay && localOverlay.enabledModes?.includes('text')) {
       await drawTextOverlay(localOverlay, 'text');
    }
    if (globalOverlay && globalOverlay.enabledModes?.includes('stamp')) {
       await drawStampOverlay(globalOverlay);
    }
    
    // 5. Head/Foot (Global)
    if (globalOverlay && globalOverlay.enabledModes?.includes('headfoot')) {
         const fontSize = globalOverlay.headfootFontSize || 10;
         const margin = 24;
         const hfColor = globalOverlay.headfootColor ? rgb(globalOverlay.headfootColor.r, globalOverlay.headfootColor.g, globalOverlay.headfootColor.b) : rgb(0.5, 0.5, 0.5);
         const hfAlign = globalOverlay.headfootAlign || 'center';
         const hFont = await getFontForConfig({ fontFamily: globalOverlay.fontFamily || 'malgun' });

         const getAlignX = (tw) => {
           if (hfAlign === 'left') return margin;
           if (hfAlign === 'right') return vW - tw - margin;
           return (vW - tw) / 2;
         };

         if (globalOverlay.headerText?.trim()) {
           const hText = globalOverlay.headerText.trim();
           const hWidth = hFont.widthOfTextAtSize(hText, fontSize);
           const hPos = vToPdf ? null : { x: getAlignX(hWidth), y: vH - margin }; // Dummy for logic check
           
           // We can also use getFinalCoords for Head/Foot for absolute consistency
           const hCoords = getFinalCoords(getAlignX(hWidth) + hWidth/2, vH - margin + fontSize/2, hWidth, fontSize, 0);
           page.drawText(hText, {
             x: hCoords.x, y: hCoords.y, size: fontSize, font: hFont, color: hfColor, opacity: 0.8, rotate: hCoords.rotate
           });
         }
         
         if (globalOverlay.footerText?.trim()) {
           const fText = globalOverlay.footerText.trim();
           const fWidth = hFont.widthOfTextAtSize(fText, fontSize);
           const fCoords = getFinalCoords(getAlignX(fWidth) + fWidth/2, margin + fontSize/2, fWidth, fontSize, 0);
           page.drawText(fText, {
             x: fCoords.x, y: fCoords.y, size: fontSize, font: hFont, color: hfColor, opacity: 0.8, rotate: fCoords.rotate
           });
         }
    }
  }

  return finalDoc.save();
}

/**
 * 9방향(3x3) 위치에 대한 좌표를 계산합니다.
 */
function calculatePosition(position, pageW, pageH, textW, textH, margin) {
  const positions = {
    'top-left': { x: margin, y: pageH - margin - textH },
    'top-center': { x: (pageW - textW) / 2, y: pageH - margin - textH },
    'top-right': { x: pageW - textW - margin, y: pageH - margin - textH },
    'middle-left': { x: margin, y: (pageH - textH) / 2 },
    'middle-center': { x: (pageW - textW) / 2, y: (pageH - textH) / 2 },
    'middle-right': { x: pageW - textW - margin, y: (pageH - textH) / 2 },
    'bottom-left': { x: margin, y: margin },
    'bottom-center': { x: (pageW - textW) / 2, y: margin },
    'bottom-right': { x: pageW - textW - margin, y: margin },
  };

  return positions[position] || positions['middle-center'];
}

/**
 * Uint8Array를 Blob URL로 변환합니다.
 * @param {Uint8Array} pdfBytes
 * @returns {string} Blob URL
 */
export function createBlobUrl(pdfBytes) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}

/**
 * Web Share API를 사용하여 PDF를 공유합니다.
 * @param {Uint8Array} pdfBytes
 * @param {string} fileName
 */
export async function sharePdf(pdfBytes, fileName = 'document.pdf') {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const file = new File([blob], fileName, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: 'PDF 문서 공유',
        files: [file],
      });
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('공유 실패:', err);
      }
      return false;
    }
  }
  return false;
}

/**
 * Web Share API 지원 여부를 확인합니다.
 */
export function isShareSupported() {
  return typeof navigator !== 'undefined' && !!navigator.canShare;
}
