import type { ASLSign, TranslateResponse } from '../types';

type JsPDF = import('jspdf').jsPDF;

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 20;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LINE = 5;

/** Provenance label for a sign, matching the badges on the sign card. */
export function signProvenance(sign: ASLSign): string {
    if (sign.is_fingerspelled) return 'Fingerspelled';
    return sign.kb_verified ? 'Verified reference (summary AI-written)' : 'AI generated';
}

/** Ordered label/value sections exported for one sign. Empty values are skipped. */
export function signSections(sign: ASLSign): [string, string][] {
    const sections: [string, string][] = [
        ['HOW TO DO IT', sign.simple_description ?? ''],
        ['HAND SHAPE', sign.hand_shape],
        ['LOCATION', sign.location],
        ['MOVEMENT', sign.movement],
        ['FACIAL EXPRESSION', sign.non_manual_markers],
    ];
    if (sign.is_fingerspelled && sign.fingerspell_letters?.length) {
        sections.splice(1, 0, ['FINGERSPELL', sign.fingerspell_letters.join(' - ')]);
    }
    return sections.filter(([, value]) => value.trim().length > 0);
}

export const pdf = {
    /** Build the PDF from the typed translation response (never from page markup). */
    async exportToPDF(result: TranslateResponse): Promise<void> {
        if (result.signs.length === 0) {
            throw new Error('No signs found to export');
        }
        try {
            // Loaded on demand so jsPDF stays out of the main bundle
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF('p', 'mm', 'a4');
            let yPos = MARGIN;

            const ensureSpace = (needed: number) => {
                if (yPos + needed > PAGE_HEIGHT - MARGIN) {
                    doc.addPage();
                    yPos = MARGIN;
                }
            };

            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text('ASL Translation', MARGIN, yPos);
            yPos += 9;

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(`Generated on ${this.getFormattedDate()}`, MARGIN, yPos);
            yPos += 5;
            doc.setDrawColor(51, 51, 51);
            doc.setLineWidth(0.5);
            doc.line(MARGIN, yPos, PAGE_WIDTH - MARGIN, yPos);
            yPos += 10;

            yPos = writeLabelled(doc, 'ENGLISH', result.query, yPos);
            if (result.asl_gloss_order) {
                yPos = writeLabelled(doc, 'ASL ORDER', result.asl_gloss_order, yPos);
            }
            yPos += 4;

            result.signs.forEach((sign, index) => {
                const sections = signSections(sign).map(
                    ([label, value]) => [label, doc.splitTextToSize(value, CONTENT_WIDTH - 10) as string[]] as const
                );
                const bodyHeight = sections.reduce((h, [, lines]) => h + 4 + lines.length * LINE + 4, 0);
                ensureSpace(Math.min(24 + bodyHeight, PAGE_HEIGHT - 2 * MARGIN));

                const cardStartY = yPos;
                doc.setFontSize(15);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(`${index + 1}. ${sign.word.toUpperCase()}`, MARGIN + 5, yPos + 10);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(102, 102, 102);
                doc.text(signProvenance(sign), PAGE_WIDTH - MARGIN - 5, yPos + 10, { align: 'right' });

                let detailY = yPos + 18;
                let spansPages = false;
                for (const [label, lines] of sections) {
                    if (detailY + 4 + lines.length * LINE > PAGE_HEIGHT - MARGIN) {
                        doc.addPage();
                        detailY = MARGIN;
                        spansPages = true;
                    }
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(102, 102, 102);
                    doc.text(label, MARGIN + 5, detailY);
                    detailY += 4;
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(0, 0, 0);
                    doc.text(lines, MARGIN + 5, detailY);
                    detailY += lines.length * LINE + 4;
                }

                // Only box cards that fit on a single page
                if (!spansPages) {
                    doc.setDrawColor(204, 204, 204);
                    doc.setLineWidth(0.3);
                    doc.roundedRect(MARGIN, cardStartY, CONTENT_WIDTH, detailY - cardStartY, 2, 2);
                }
                yPos = detailY + 8;
            });

            if (result.note) {
                yPos = writeLabelled(doc, 'ASL GRAMMAR NOTE', result.note, yPos);
            }

            ensureSpace(12);
            doc.setFontSize(8);
            doc.setTextColor(120, 120, 120);
            doc.text(
                doc.splitTextToSize('AI-generated descriptions may contain errors. Verify with a native signer or an ASL resource.', CONTENT_WIDTH),
                MARGIN,
                yPos + 4,
            );

            doc.save(`ASL_Translation_${this.sanitizeFileName(result.query)}_${Date.now()}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
            throw new Error('Failed to generate PDF. Please try again.');
        }
    },

    sanitizeFileName(text: string): string {
        return text
            .replace(/[^a-z0-9]/gi, '_')
            .replace(/_+/g, '_')
            .substring(0, 50);
    },

    getFormattedDate(): string {
        return new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    },
};

function writeLabelled(doc: JsPDF, label: string, value: string, yPos: number): number {
    const lines = doc.splitTextToSize(value, CONTENT_WIDTH) as string[];
    if (yPos + 8 + lines.length * LINE > PAGE_HEIGHT - MARGIN) {
        doc.addPage();
        yPos = MARGIN;
    }
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(102, 102, 102);
    doc.text(label, MARGIN, yPos);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(lines, MARGIN, yPos + 5);
    return yPos + 5 + lines.length * LINE + 4;
}
