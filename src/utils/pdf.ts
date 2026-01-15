/**
 * PDF Export Utility
 * Handles PDF generation for translation results
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const pdf = {
    /**
     * Generate and download PDF from translation results
     */
    async exportToPDF(query: string): Promise<void> {
        try {
            // Find the results section
            const resultsSection = document.querySelector('.results-section') as HTMLElement;
            if (!resultsSection) {
                throw new Error('Results section not found');
            }

            // Create a temporary container for PDF content
            const container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.top = '0';
            container.style.width = '800px';
            container.style.padding = '40px';
            container.style.backgroundColor = '#ffffff';
            container.style.fontFamily = 'Arial, sans-serif';
            document.body.appendChild(container);

            // Clone the results content
            const resultsClone = resultsSection.cloneNode(true) as HTMLElement;

            // Remove action buttons from the clone
            const actionButtons = resultsClone.querySelector('.action-buttons');
            if (actionButtons) {
                actionButtons.remove();
            }

            // Remove feedback widget from the clone
            const feedbackWidget = resultsClone.querySelector('.feedback-widget');
            if (feedbackWidget) {
                feedbackWidget.remove();
            }

            // Recursively force all text to black and backgrounds to white
            const forceReadableColors = (element: HTMLElement) => {
                // Force this element's styles
                element.style.color = '#000000';
                element.style.backgroundColor = '#ffffff';

                // Remove any problematic styles
                element.style.opacity = '1';
                element.style.filter = 'none';

                // Recursively apply to all children
                const allElements = element.querySelectorAll('*');
                allElements.forEach((el: Element) => {
                    const htmlEl = el as HTMLElement;
                    htmlEl.style.color = '#000000';

                    // Set appropriate backgrounds
                    if (htmlEl.classList.contains('sign-card')) {
                        htmlEl.style.backgroundColor = '#ffffff';
                        htmlEl.style.border = '1px solid #cccccc';
                    } else if (htmlEl.classList.contains('detail-icon') ||
                               htmlEl.classList.contains('sign-number')) {
                        htmlEl.style.backgroundColor = '#f0f0f0';
                        htmlEl.style.color = '#000000';
                    } else if (htmlEl.classList.contains('asl-note')) {
                        htmlEl.style.backgroundColor = '#f9f9f9';
                        htmlEl.style.border = '1px solid #cccccc';
                    } else {
                        // Default to white or transparent
                        if (window.getComputedStyle(htmlEl).backgroundColor !== 'rgba(0, 0, 0, 0)') {
                            htmlEl.style.backgroundColor = '#ffffff';
                        }
                    }

                    // Force headings to be bold and black
                    if (htmlEl.tagName.match(/^H[1-6]$/)) {
                        htmlEl.style.fontWeight = 'bold';
                        htmlEl.style.color = '#000000';
                    }

                    // Force labels to be slightly gray but readable
                    if (htmlEl.classList.contains('detail-label')) {
                        htmlEl.style.color = '#666666';
                        htmlEl.style.fontSize = '12px';
                    }

                    // Force values to be black
                    if (htmlEl.classList.contains('detail-value')) {
                        htmlEl.style.color = '#000000';
                        htmlEl.style.fontSize = '14px';
                        htmlEl.style.fontWeight = '500';
                    }

                    htmlEl.style.opacity = '1';
                    htmlEl.style.filter = 'none';
                });
            };

            forceReadableColors(resultsClone);

            // Add header with title and date
            const header = document.createElement('div');
            header.style.marginBottom = '30px';
            header.style.borderBottom = '2px solid #333';
            header.style.paddingBottom = '20px';
            header.innerHTML = `
                <h1 style="margin: 0 0 10px 0; font-size: 28px; color: #333;">ASL Dictionary Translation</h1>
                <p style="margin: 0; color: #666; font-size: 14px;">Generated on ${this.getFormattedDate()}</p>
            `;

            container.appendChild(header);
            container.appendChild(resultsClone);

            // Capture the container as canvas
            const canvas = await html2canvas(container, {
                scale: 1.5, // Reduced from 2 to make smaller PDFs
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: 800,
                windowHeight: container.scrollHeight,
            });

            // Remove temporary container
            document.body.removeChild(container);

            // Calculate PDF dimensions
            const imgWidth = 210; // A4 width in mm
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            // Create PDF
            const doc = new jsPDF('p', 'mm', 'a4');
            const imgData = canvas.toDataURL('image/png');

            // Handle multi-page PDFs
            let heightLeft = imgHeight;
            let position = 0;

            doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= 297; // A4 height in mm

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                doc.addPage();
                doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= 297;
            }

            // Download PDF
            const fileName = `ASL_Translation_${this.sanitizeFileName(query)}_${Date.now()}.pdf`;
            doc.save(fileName);

        } catch (error) {
            console.error('Error generating PDF:', error);
            throw new Error('Failed to generate PDF. Please try again.');
        }
    },

    /**
     * Sanitize filename by removing special characters
     */
    sanitizeFileName(text: string): string {
        return text
            .replace(/[^a-z0-9]/gi, '_')
            .replace(/_+/g, '_')
            .substring(0, 50);
    },

    /**
     * Format date for PDF header
     */
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
