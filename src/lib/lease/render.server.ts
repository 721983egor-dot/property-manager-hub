import { resolve } from "node:path";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, Footer, PageNumber, AlignmentType } from "docx";
import { renderLease, type LeaseSnapshot } from "./model";
export async function renderLeaseFiles(snapshot: LeaseSnapshot) {
  const sections = renderLease(snapshot);
  const pdf = await new Promise<Buffer>((resolvePdf, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 52, bottom: 52, left: 55, right: 55 },
      font: resolve(process.cwd(), "assets/lease-fonts/NotoSans-Regular.ttf"),
      bufferPages: true,
      info: { Title: "Договор аренды " + snapshot.number, Author: "Резиденция Море" },
    });
    const parts: Buffer[] = [];
    doc.on("data", (b) => parts.push(b));
    doc.on("error", reject);
    doc.on("end", () => resolvePdf(Buffer.concat(parts)));
    sections.forEach((section, index) => {
      if (index) doc.addPage();
      for (const line of section.text.split("\n")) {
        const heading = /^(ДОГОВОР|АКТ|ОПИСЬ)/.test(line);
        doc
          .fontSize(heading ? 13 : 10.5)
          .fillColor("#252525")
          .text(line || " ", { lineGap: 4, align: heading ? "center" : "left" });
      }
    });
    const pages = doc.bufferedPageRange();
    for (let page = 0; page < pages.count; page++) {
      doc.switchToPage(page);
      doc
        .fontSize(8)
        .fillColor("#888888")
        .text(`${snapshot.number} · ${page + 1} / ${pages.count}`, 55, doc.page.height - 35, {
          lineBreak: false,
        });
    }
    doc.end();
  });
  const document = new Document({
    creator: "Резиденция Море",
    title: "Договор аренды " + snapshot.number,
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22 },
          paragraph: { spacing: { after: 120, line: 300 } },
        },
      },
    },
    sections: sections.map((section) => ({
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: snapshot.number + " · ", size: 16 }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16 }),
              ],
            }),
          ],
        }),
      },
      children: section.text.split("\n").map(
        (text) =>
          new Paragraph({
            ...(/^(ДОГОВОР|АКТ|ОПИСЬ)/.test(text) ? { style: "Title" } : {}),
            alignment: /^(ДОГОВОР|АКТ|ОПИСЬ)/.test(text)
              ? AlignmentType.CENTER
              : AlignmentType.LEFT,
            children: [
              new TextRun({
                text,
                color: "000000",
                bold: /^(ДОГОВОР|АКТ|ОПИСЬ)/.test(text),
                size: /^(ДОГОВОР|АКТ|ОПИСЬ)/.test(text) ? 26 : 22,
              }),
            ],
          }),
      ),
    })),
  });
  return { pdf, docx: await Packer.toBuffer(document) };
}
