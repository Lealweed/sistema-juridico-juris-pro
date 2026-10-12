export const LETTERHEAD_URL = '/brand/lima-diogenes-timbrado.png';

// Page margins reserve space for the supplied artwork on every printed page.
export const letterheadPrintStyles = `
  @page { size:A4; margin:0; }
  * { box-sizing:border-box; }
  body { margin:0 auto; width:210mm; min-height:297mm; padding:0; position:relative; font-family:'Times New Roman',serif; color:#111; background:white; }
  .letterhead { position:absolute; left:0; top:0; width:210mm; height:297mm; z-index:0; pointer-events:none; }
  .document-body { position:relative; z-index:1; overflow-wrap:anywhere; }
  .print-layout { position:relative; z-index:1; width:100%; border-collapse:collapse; }
  .print-layout > thead > tr > td { height:40mm; padding:0; border:0; background:transparent; }
  .print-layout > tfoot > tr > td { height:35mm; padding:0; border:0; background:transparent; }
  .print-layout > tbody > tr > td { padding:0 20mm; border:0; background:transparent; }
  @media print {
    body { width:auto; min-height:0; padding:0; }
    .letterhead { position:fixed; top:0; left:0; }
    button { display:none; }
    tr { break-inside:avoid; }
    .print-layout > tbody > tr { break-inside:auto; }
    thead { display:table-header-group; }
  }
`;

export const letterheadBodyStart = `<img class="letterhead" src="${LETTERHEAD_URL}" alt="Papel timbrado Lima e Diógenes"/><table class="print-layout" role="presentation"><thead><tr><td></td></tr></thead><tbody><tr><td><main class="document-body">`;
export const letterheadBodyEnd = '</main></td></tr></tbody><tfoot><tr><td></td></tr></tfoot></table>';
