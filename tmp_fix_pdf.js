const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'khanathip.s', 'Downloads', 'Project_Git', 'src', 'components', 'Fmit12PdfPreview.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace font sizes to be slightly larger
content = content.replace(/fontSize: '12px'/g, "fontSize: '14px'");
content = content.replace(/fontSize: '10px'/g, "fontSize: '12px'");

// Fix the title font directly
content = content.replace(
    /fontSize: '14px', fontWeight: 'bold'[^]*?ใบขอเพิ่มบัญชีผู้ใช้งานระบบเทคโนโลยีสารสนเทศ \(FMIT 12\)/,
    "fontSize: '16px', fontWeight: 'bold' }}>\n                                ใบขอเพิ่มบัญชีผู้ใช้งานระบบเทคโนโลยีสารสนเทศ (FMIT 12)"
);

// Make the A4 stretch fully when height grows, fixing the white background cutoff bug
content = content.replace(/minHeight: '297mm',/g, "minHeight: '297mm',\n                            height: 'max-content',");

// Reduce spacing so it doesn't overflow dramatically when font is bigger
content = content.replace(/marginBottom: '25px'/g, "marginBottom: '15px'");
content = content.replace(/marginBottom: '15px'/g, "marginBottom: '10px'");
content = content.replace(/marginBottom: '20px'/g, "marginBottom: '15px'");
content = content.replace(/marginTop: '20px'/g, "marginTop: '10px'");
content = content.replace(/marginTop: '24px'/g, "marginTop: '20px'"); // Dotted line spaces
content = content.replace(/minHeight: '24px'/g, "minHeight: '20px'"); // Dotted line spaces
content = content.replace(/lineHeight: '24px'/g, "lineHeight: '20px'"); // Dotted line spaces

// Reduce padding a tiny bit on the A4 to fit the larger text comfortably
content = content.replace(/padding: '40px 45px',/g, "padding: '30px 40px',");

fs.writeFileSync(filePath, content);
console.log('Fixed PDF Preview Font Sizes & Layout');
