import { Injectable } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
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
    address?: string;
    taxId?: string;
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
  invoiceTerms?: string;
  createdAt: Date;
}

@Injectable()
export class InvoicePdfService {
  private fetchImageBuffer(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  async generatePdf(data: InvoicePdfData): Promise<Buffer> {
    // Pre-fetch logo if available
    let logoBuffer: Buffer | null = null;
    if (data.brand.logoUrl) {
      try {
        logoBuffer = await this.fetchImageBuffer(data.brand.logoUrl);
      } catch {
        logoBuffer = null; // fall back to text if fetch fails
      }
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const primaryColor = data.brand.colors?.primary || '#1a1a2e';
      const accentColor = data.brand.colors?.accent || '#00bfa5';
      const grayText = '#6b7280';
      const darkText = '#111827';

      // 1. Header Card
      const cardY = 40;
      const cardHeight = 120;
      doc.roundedRect(40, cardY, 515, cardHeight, 15)
         .lineWidth(1)
         .strokeColor('#f3f4f6')
         .stroke();

      // Brand Logo or Name
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, 60, cardY + 15, { height: 50, fit: [160, 50] });
        } catch {
          doc.fontSize(20).fillColor(darkText).font('Helvetica-Bold').text(data.brand.name.toUpperCase(), 60, cardY + 25);
        }
      } else {
        doc.fontSize(20).fillColor(darkText).font('Helvetica-Bold').text(data.brand.name.toUpperCase(), 60, cardY + 25);
      }

      // Invoice ID & Date (Top Right)
      doc.fontSize(10).fillColor(grayText).font('Helvetica').text('Invoice ID: ', 380, cardY + 20, { continued: true })
         .fillColor(darkText).font('Helvetica-Bold').text(data.invoiceNumber);

      doc.fontSize(10).fillColor(grayText).font('Helvetica').text('Date: ', 380, cardY + 35, { continued: true })
         .fillColor(darkText).font('Helvetica-Bold').text(data.createdAt.toLocaleDateString());

      // Client Info & Status
      doc.fontSize(9).fillColor(grayText).font('Helvetica').text('Invoice to', 60, cardY + 70);
      doc.fontSize(12).fillColor(darkText).font('Helvetica-Bold').text(data.client.contactName || 'Client Name', 60, cardY + 85);
      doc.fontSize(9).fillColor(grayText).font('Helvetica').text(data.client.email, 60, cardY + 102);

      doc.fontSize(9).fillColor(grayText).font('Helvetica').text('Payment Status', 240, cardY + 70);
      doc.fontSize(12).fillColor(darkText).font('Helvetica-Bold').text(data.status, 240, cardY + 85);

      // Total Due
      doc.fontSize(9).fillColor(grayText).font('Helvetica').text('Total Due', 400, cardY + 75, { align: 'right', width: 130 });
      const currencySymbol = data.currency === 'USD' ? '$' : data.currency;
      doc.fontSize(22).fillColor(accentColor).font('Helvetica-Bold').text(`${currencySymbol}${data.amount.toFixed(2)}`, 400, cardY + 88, { align: 'right', width: 130 });

      // 2. Items Table
      let y = cardY + cardHeight + 40;

      doc.moveTo(40, y).lineTo(555, y).lineWidth(1).dash(2, { space: 2 }).strokeColor('#e5e7eb').stroke().undash();
      y += 20;

      doc.fontSize(10).fillColor(grayText).font('Helvetica');
      doc.text('Sr.', 40, y);
      doc.text('Name', 140, y);
      doc.text('Price', 340, y);
      doc.text('Qty', 460, y);
      doc.text('Amount', 500, y, { align: 'right' });

      y += 15;
      doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).strokeColor('#f3f4f6').stroke();
      y += 15;

      const items = data.sale.items?.length
        ? data.sale.items
        : [{ name: data.sale.description || 'Services Rendered', quantity: 1, unitPrice: data.amount, total: data.amount }];

      items.forEach((item, index) => {
        doc.fontSize(10).fillColor(darkText).font('Helvetica');
        doc.text(String(index + 1), 40, y);
        doc.text(item.name, 140, y, { width: 180 });
        doc.text(`${currencySymbol}${item.unitPrice.toFixed(2)}`, 340, y);
        doc.text(String(item.quantity), 460, y);
        doc.font('Helvetica-Bold').text(`${currencySymbol}${item.total.toFixed(2)}`, 500, y, { align: 'right' });
        y += 30;
      });

      // 3. Totals Section
      y += 20;
      const totalBoxY = y;
      doc.roundedRect(360, y, 195, 80, 10).fill('#f9fafb');

      doc.fontSize(10).fillColor(grayText).font('Helvetica').text('Subtotal', 375, y + 15);
      doc.fillColor(darkText).font('Helvetica-Bold').text(`${currencySymbol}${data.amount.toFixed(2)}`, 500, y + 15, { align: 'right', width: 45 });

      doc.fontSize(10).fillColor(grayText).font('Helvetica').text('Tax', 375, y + 35);
      doc.fillColor(darkText).font('Helvetica-Bold').text(`${currencySymbol}0.00`, 500, y + 35, { align: 'right', width: 45 });

      doc.moveTo(375, y + 55).lineTo(540, y + 55).lineWidth(0.5).strokeColor('#e5e7eb').stroke();

      doc.fontSize(10).fillColor(grayText).font('Helvetica').text('Total Due', 375, y + 65);
      doc.fillColor(accentColor).font('Helvetica-Bold').text(`${currencySymbol}${data.amount.toFixed(2)}`, 500, y + 65, { align: 'right', width: 45 });

      // 4. Services Description & Terms
      y = totalBoxY + 110;

      if (data.sale.description) {
        doc.fontSize(12).fillColor(darkText).font('Helvetica-Bold').text('Services Includes', 40, y);
        y += 20;
        doc.fontSize(9).fillColor(darkText).font('Helvetica').text(data.sale.description, 40, y);
        y += 40;
      }

      // Notes
      if (data.notes) {
        doc.fontSize(12).fillColor(darkText).font('Helvetica-Bold').text('Notes', 40, y);
        y += 20;
        doc.fontSize(9).fillColor(darkText).font('Helvetica').text(data.notes, 40, y, { width: 515 });
        y += doc.heightOfString(data.notes, { width: 515 }) + 20;
      }

      // Terms — dynamic from invoiceConfig, fallback to nothing
      if (data.invoiceTerms) {
        doc.fontSize(12).fillColor(darkText).font('Helvetica-Bold').text('Terms', 40, y);
        y += 20;
        doc.fontSize(8.5).fillColor(darkText).font('Helvetica').text(data.invoiceTerms, 40, y, { width: 515, align: 'justify', lineGap: 2 });
      }

      // 5. Footer — dynamic from invoiceConfig
      const footerY = doc.page.height - 80;
      doc.fontSize(10).fillColor(darkText).font('Helvetica-Bold');

      const footerLines = [
        data.brand.website,
        data.brand.email,
        data.brand.phone,
        data.brand.address,
        data.brand.taxId ? `Tax ID: ${data.brand.taxId}` : null,
      ].filter(Boolean) as string[];

      footerLines.forEach((line, i) => {
        doc.text(line, 40, footerY + i * 15, { align: 'right', width: 515 });
      });

      // Primary color accent line at bottom
      doc.moveTo(40, doc.page.height - 30).lineTo(555, doc.page.height - 30)
         .lineWidth(2).strokeColor(primaryColor).stroke();

      doc.end();
    });
  }
}
