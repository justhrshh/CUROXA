import api from './api.js';

const loadPdfJs = () => {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.onload = () => {
      const pdfjs = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
      if (pdfjs) {
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        resolve(pdfjs);
      } else {
        reject(new Error('pdfjsLib not found on window'));
      }
    };
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
};

export const convertPdfToImage = async (pdfUrlOrDataUri) => {
  if (!pdfUrlOrDataUri) return null;

  // Check if the input is a PDF
  const isPdf = pdfUrlOrDataUri.toLowerCase().endsWith('.pdf') || 
                pdfUrlOrDataUri.toLowerCase().includes('.pdf') || 
                pdfUrlOrDataUri.toLowerCase().includes('application/pdf') || 
                pdfUrlOrDataUri.startsWith('data:application/pdf');

  if (!isPdf) {
    return pdfUrlOrDataUri;
  }

  try {
    const pdfjs = await loadPdfJs();
    let loadingTask;

    if (pdfUrlOrDataUri.startsWith('data:application/pdf')) {
      const base64Str = pdfUrlOrDataUri.split(';base64,')[1];
      const binaryStr = window.atob(base64Str);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      loadingTask = pdfjs.getDocument({ data: bytes });
    } else {
      const response = await api.get(pdfUrlOrDataUri, { responseType: 'blob' });
      const blob = response.data;
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      loadingTask = pdfjs.getDocument({ data: bytes });
    }

    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    // Render page to canvas with high resolution (scale 2.5) for quality print/view
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error("Failed to convert PDF letterhead to image:", err);
    return pdfUrlOrDataUri; // Return original as fallback
  }
};
