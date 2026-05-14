import jsPDF from 'jspdf';

export const pdf = {
    async exportToPDF(query: string): Promise<void> {
        try {
            const resultsSection = document.querySelector('.results-section') as HTMLElement;
            if (!resultsSection) {
                throw new Error('Results section not found');
            }

            const titleEl = resultsSection.querySelector('.results-title');
            const title = titleEl ? titleEl.textContent || 'Translation Results' : 'Translation Results';

            const signCards = resultsSection.querySelectorAll('.sign-card');
            if (signCards.length === 0) {
                throw new Error('No signs found to export');
            }

            const doc = new jsPDF('p', 'mm', 'a4');
            const pageWidth = 210;
            const pageHeight = 297;
            const margin = 20;
            const contentWidth = pageWidth - (2 * margin);
            let yPos = margin;

            const checkPageBreak = (needed: number) => {
                if (yPos + needed > pageHeight - margin) {
                    doc.addPage();
                    yPos = margin;
                    return true;
                }
                return false;
            };

            doc.setFontSize(24);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text('ASL Dictionary Translation', margin, yPos);
            yPos += 10;

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(`Generated on ${this.getFormattedDate()}`, margin, yPos);
            yPos += 5;

            doc.setDrawColor(51, 51, 51);
            doc.setLineWidth(0.5);
            doc.line(margin, yPos, pageWidth - margin, yPos);
            yPos += 15;

            doc.setFontSize(18);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(200, 200, 200);
            const wrappedTitle = doc.splitTextToSize(title, contentWidth);
            doc.text(wrappedTitle, margin, yPos);
            yPos += (wrappedTitle.length * 8) + 10;

            signCards.forEach((card, index) => {
                const signWord = card.querySelector('.sign-word')?.textContent || '';
                const handShape = card.querySelector('.detail-value')?.textContent || '';
                const details = card.querySelectorAll('.sign-detail-item');

                let location = '';
                let movement = '';

                details.forEach((detail) => {
                    const label = detail.querySelector('.detail-label')?.textContent?.toLowerCase() || '';
                    const value = detail.querySelector('.detail-value')?.textContent || '';

                    if (label.includes('location')) location = value;
                    else if (label.includes('movement')) movement = value;
                });

                const wrappedHandShape = doc.splitTextToSize(handShape, contentWidth - 10);
                const wrappedLocation = doc.splitTextToSize(location, contentWidth - 10);
                const wrappedMovement = doc.splitTextToSize(movement, contentWidth - 10);

                const cardHeight = 20 + // header space
                    (wrappedHandShape.length * 5 + 12) + // Hand shape section
                    (wrappedLocation.length * 5 + 12) +  // Location section
                    (wrappedMovement.length * 5 + 12);   // Movement section

                checkPageBreak(cardHeight + 10);

                const cardStartY = yPos;

                doc.setFillColor(51, 51, 51);
                doc.roundedRect(pageWidth - margin - 20, yPos + 5, 15, 8, 2, 2, 'F');
                doc.setFontSize(10);
                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'bold');
                doc.text(`#${index + 1}`, pageWidth - margin - 17.5, yPos + 10.5);

                doc.setFontSize(16);
                doc.setTextColor(0, 0, 0);
                doc.setFont('helvetica', 'bold');
                doc.text(signWord.toUpperCase(), margin + 5, yPos + 12);

                let detailY = yPos + 22;

                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(102, 102, 102);
                doc.text('HAND SHAPE', margin + 5, detailY);
                detailY += 4;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(10);
                doc.text(wrappedHandShape, margin + 5, detailY);
                detailY += (wrappedHandShape.length * 5) + 8;

                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(102, 102, 102);
                doc.text('LOCATION', margin + 5, detailY);
                detailY += 4;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(10);
                doc.text(wrappedLocation, margin + 5, detailY);
                detailY += (wrappedLocation.length * 5) + 8;

                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(102, 102, 102);
                doc.text('MOVEMENT', margin + 5, detailY);
                detailY += 4;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(10);
                doc.text(wrappedMovement, margin + 5, detailY);
                detailY += (wrappedMovement.length * 5) + 4;

                doc.setDrawColor(204, 204, 204);
                doc.setLineWidth(0.3);
                doc.roundedRect(margin, cardStartY, contentWidth, detailY - cardStartY, 2, 2);

                yPos = detailY + 10;
            });

            const noteEl = resultsSection.querySelector('.asl-note');
            if (noteEl) {
                const noteText = noteEl.querySelector('.note-text')?.textContent || '';
                const wrappedNote = doc.splitTextToSize(noteText, contentWidth - 10);
                const noteHeight = 10 + (wrappedNote.length * 5) + 10;

                checkPageBreak(noteHeight);

                const noteStartY = yPos;
                const noteBoxHeight = 8 + 5 + (wrappedNote.length * 5) + 5;

                doc.setFillColor(249, 249, 249);
                doc.setDrawColor(204, 204, 204);
                doc.roundedRect(margin, noteStartY, contentWidth, noteBoxHeight, 2, 2, 'FD');

                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text('ASL Grammar Note', margin + 5, yPos + 8);
                yPos += 13;

                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.text(wrappedNote, margin + 5, yPos);
                yPos += (wrappedNote.length * 5) + 5;
            }

            const fileName = `ASL_Translation_${this.sanitizeFileName(query)}_${Date.now()}.pdf`;
            doc.save(fileName);

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
