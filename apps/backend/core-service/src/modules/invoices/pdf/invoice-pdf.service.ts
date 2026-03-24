import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

export interface InvoicePdfData {
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate: Date;
  status: string;
  notes?: string;
  client: {
    contactName?: string;
    email: string;
    phone?: string;
    address?: string;
  };
  brand: {
    name: string;
    logoUrl?: string;
    website?: string;
    email?: string;
    phone?: string;
    colors?: Record<string, string>;
  };
  sale: {
    description?: string;
    items?: Array<{
      name: string;
      description?: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
  };
  createdAt: Date;
}

@Injectable()
export class InvoicePdfService {
  async generatePdf(data: InvoicePdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const primaryColor = data.brand.colors?.primary || '#1a1a2e';
      const accentColor = data.brand.colors?.accent || '#00bfa5'; // Teal from image
      const grayText = '#6b7280';
      const darkText = '#111827';

      // 1. Header Card (Rounded rectangle)
      const cardY = 40;
      const cardHeight = 120;
      doc.roundedRect(40, cardY, 515, cardHeight, 15)
         .lineWidth(1)
         .strokeColor('#f3f4f6')
         .stroke();

      // Brand Logo/Name
      if (data.brand.logoUrl) {
         // Placeholder for logo handling if needed, otherwise text
         doc.fontSize(20).fillColor(darkText).font('Helvetica-Bold').text(data.brand.name.toUpperCase(), 60, cardY + 25);
      } else {
         doc.fontSize(20).fillColor(darkText).font('Helvetica-Bold').text(data.brand.name.toUpperCase(), 60, cardY + 25);
      }

      // Invoice ID & Date (Top Right)
      doc.fontSize(10).fillColor(grayText).font('Helvetica').text('Invoice ID: ', 380, cardY + 20, { continued: true })
         .fillColor(darkText).font('Helvetica-Bold').text(data.invoiceNumber);
      
      doc.fontSize(10).fillColor(grayText).font('Helvetica').text('Date: ', 380, cardY + 35, { continued: true })
         .fillColor(darkText).font('Helvetica-Bold').text(data.createdAt.toLocaleDateString());

      // Client Info & Status (Bottom of Card)
      doc.fontSize(9).fillColor(grayText).font('Helvetica').text('Invoice to', 60, cardY + 70);
      doc.fontSize(12).fillColor(darkText).font('Helvetica-Bold').text(data.client.contactName || 'Client Name', 60, cardY + 85);
      doc.fontSize(9).fillColor(grayText).font('Helvetica').text(data.client.email, 60, cardY + 102);

      doc.fontSize(9).fillColor(grayText).font('Helvetica').text('Payment Status', 240, cardY + 70);
      doc.fontSize(12).fillColor(darkText).font('Helvetica-Bold').text(data.status, 240, cardY + 85);

      // Total Due Highlight
      doc.fontSize(9).fillColor(grayText).font('Helvetica').text('Total Due', 400, cardY + 75, { align: 'right', width: 130 });
      doc.fontSize(22).fillColor(accentColor).font('Helvetica-Bold').text(`${data.currency === 'USD' ? '$' : data.currency}${data.amount.toFixed(2)}`, 400, cardY + 88, { align: 'right', width: 130 });

      // 2. Items Table
      let y = cardY + cardHeight + 40;
      
      // Divider
      doc.moveTo(40, y).lineTo(555, y).lineWidth(1).dash(2, { space: 2 }).strokeColor('#e5e7eb').stroke().undash();
      y += 20;

      // Table Header
      doc.fontSize(10).fillColor(grayText).font('Helvetica');
      doc.text('Sr.', 40, y);
      doc.text('Name', 140, y);
      doc.text('Price', 340, y);
      doc.text('Qty', 460, y);
      doc.text('Amount', 500, y, { align: 'right' });

      y += 15;
      doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).strokeColor('#f3f4f6').stroke();
      y += 15;

      // Table Body
      const items = data.sale.items || [
        { name: data.sale.description || 'Services Rendered', quantity: 1, unitPrice: data.amount, total: data.amount }
      ];

      items.forEach((item, index) => {
        doc.fontSize(10).fillColor(darkText).font('Helvetica');
        doc.text(String(index + 1), 40, y);
        doc.text(item.name, 140, y, { width: 180 });
        doc.text(`${data.currency === 'USD' ? '$' : ''}${item.unitPrice.toFixed(2)}`, 340, y);
        doc.text(String(item.quantity), 460, y);
        doc.font('Helvetica-Bold').text(`${data.currency === 'USD' ? '$' : ''}${item.total.toFixed(2)}`, 500, y, { align: 'right' });
        
        y += 30; // Spacing for next item
      });

      // 3. Totals Section
      y += 20;
      const totalBoxY = y;
      doc.roundedRect(360, y, 195, 80, 10).fill('#f9fafb');
      
      doc.fontSize(10).fillColor(grayText).font('Helvetica').text('Subtotal', 375, y + 15);
      doc.fillColor(darkText).font('Helvetica-Bold').text(`${data.currency === 'USD' ? '$' : ''}${data.amount.toFixed(2)}`, 500, y + 15, { align: 'right', width: 45 });
      
      doc.fontSize(10).fillColor(grayText).font('Helvetica').text('Tax', 375, y + 35);
      doc.fillColor(darkText).font('Helvetica-Bold').text('$0.00', 500, y + 35, { align: 'right', width: 45 });

      doc.moveTo(375, y + 55).lineTo(540, y + 55).lineWidth(0.5).strokeColor('#e5e7eb').stroke();

      doc.fontSize(10).fillColor(grayText).font('Helvetica').text('Total Due', 375, y + 65);
      doc.fillColor(accentColor).font('Helvetica-Bold').text(`${data.currency === 'USD' ? '$' : ''}${data.amount.toFixed(2)}`, 500, y + 65, { align: 'right', width: 45 });

      // 4. Services Includes & Terms
      y = totalBoxY + 110;
      
      doc.fontSize(12).fillColor(darkText).font('Helvetica-Bold').text('Services Includes', 40, y);
      y += 20;
      doc.fontSize(9).fillColor(darkText).font('Helvetica').text(data.sale.description || 'N/A', 40, y);
      
      y += 40;
      doc.fontSize(12).fillColor(darkText).font('Helvetica-Bold').text('Terms', 40, y);
      y += 20;

      const terms = [
        'All work is 100% original, professionally ghostwritten/edited, and fully owned by you. We provide unlimited revisions during the writing and editing process. Our dedicated in-house U.S.-based writing team works Monday to Friday to ensure consistent progress. Our Company claims no royalties, credit, or rights—you retain full ownership and profits from your book.',
        'Publishing turnaround is typically 10–12 business days after final approval. Should you be dissatisfied or if agreed services are not delivered, you may cancel at any time during the project for a full refund. Please note: Refunds are not issued for change of mind.'
      ];

      terms.forEach(term => {
        doc.circle(45, y + 3, 2).fill(darkText);
        doc.fontSize(8.5).fillColor(darkText).font('Helvetica').text(term, 55, y, { width: 500, align: 'justify', lineGap: 2 });
        y += doc.heightOfString(term, { width: 500 }) + 10;
      });

      // 5. Footer
      const footerY = doc.page.height - 80;
      doc.fontSize(10).fillColor(darkText).font('Helvetica-Bold');
      
      const brandWebsite = data.brand.website || `https://${data.brand.name.toLowerCase().replace(/\s+/g, '')}.com`;
      const brandEmail = data.brand.email || `billing@${data.brand.name.toLowerCase().replace(/\s+/g, '')}.com`;
      const brandPhone = data.brand.phone || '(888) 909-9431';

      doc.text(brandWebsite, 40, footerY, { align: 'right', width: 515 });
      doc.text(brandEmail, 40, footerY + 15, { align: 'right', width: 515 });
      doc.text(brandPhone, 40, footerY + 30, { align: 'right', width: 515 });

      doc.end();
    });
  }
}
