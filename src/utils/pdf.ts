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
        let container: HTMLElement | null = null;

        try {
            // Find the results section
            const resultsSection = document.querySelector('.results-section') as HTMLElement;
            if (!resultsSection) {
                throw new Error('Results section not found');
            }

            // Create a temporary container for PDF content (off-screen to avoid visual glitches)
            container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.left = '-99999px';
            container.style.top = '0';
            container.style.width = '800px';
            container.style.minHeight = '100vh';
            container.style.padding = '40px';
            container.style.backgroundColor = '#ffffff';
            container.style.fontFamily = 'Arial, sans-serif';
            container.style.overflow = 'visible';
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

            // Aggressively force all text and backgrounds to be readable
            const forceReadableStyles = (element: HTMLElement) => {
                // Get all elements including the root
                const allElements = [element, ...Array.from(element.querySelectorAll('*'))] as HTMLElement[];

                allElements.forEach((el) => {
                    // Force black text by default
                    el.style.setProperty('color', '#000000', 'important');
                    el.style.setProperty('opacity', '1', 'important');
                    el.style.setProperty('filter', 'none', 'important');

                    // Handle specific element types
                    const tag = el.tagName.toLowerCase();
                    const classes = el.className;

                    // Headings - bold and black
                    if (tag.match(/^h[1-6]$/)) {
                        el.style.setProperty('color', '#000000', 'important');
                        el.style.setProperty('font-weight', 'bold', 'important');
                        el.style.setProperty('background-color', 'transparent', 'important');
                    }

                    // Sign cards - white background with border
                    if (classes.includes('sign-card')) {
                        el.style.setProperty('background-color', '#ffffff', 'important');
                        el.style.setProperty('border', '2px solid #cccccc', 'important');
                        el.style.setProperty('box-shadow', 'none', 'important');
                        el.style.setProperty('display', 'block', 'important');
                        el.style.setProperty('margin-bottom', '20px', 'important');
                        el.style.setProperty('padding', '20px', 'important');
                    }

                    // Sign word - large and bold
                    if (classes.includes('sign-word')) {
                        el.style.setProperty('color', '#000000', 'important');
                        el.style.setProperty('font-size', '24px', 'important');
                        el.style.setProperty('font-weight', 'bold', 'important');
                    }

                    // Sign number badge
                    if (classes.includes('sign-number')) {
                        el.style.setProperty('background-color', '#333333', 'important');
                        el.style.setProperty('color', '#ffffff', 'important');
                        el.style.setProperty('padding', '4px 12px', 'important');
                        el.style.setProperty('border-radius', '12px', 'important');
                    }

                    // Detail icons
                    if (classes.includes('detail-icon')) {
                        el.style.setProperty('background-color', '#f0f0f0', 'important');
                        el.style.setProperty('color', '#000000', 'important');
                        el.style.setProperty('border-radius', '8px', 'important');
                        el.style.setProperty('padding', '8px', 'important');
                    }

                    // Detail labels - dark gray
                    if (classes.includes('detail-label')) {
                        el.style.setProperty('color', '#666666', 'important');
                        el.style.setProperty('font-size', '11px', 'important');
                        el.style.setProperty('font-weight', '600', 'important');
                        el.style.setProperty('text-transform', 'uppercase', 'important');
                    }

                    // Detail values - black and bold
                    if (classes.includes('detail-value')) {
                        el.style.setProperty('color', '#000000', 'important');
                        el.style.setProperty('font-size', '14px', 'important');
                        el.style.setProperty('font-weight', '500', 'important');
                        el.style.setProperty('line-height', '1.5', 'important');
                    }

                    // ASL note - light background with dark text
                    if (classes.includes('asl-note')) {
                        el.style.setProperty('background-color', '#f9f9f9', 'important');
                        el.style.setProperty('border', '2px solid #cccccc', 'important');
                        el.style.setProperty('padding', '20px', 'important');
                        el.style.setProperty('margin-top', '20px', 'important');
                    }

                    if (classes.includes('note-title')) {
                        el.style.setProperty('color', '#000000', 'important');
                        el.style.setProperty('font-weight', 'bold', 'important');
                        el.style.setProperty('font-size', '16px', 'important');
                    }

                    if (classes.includes('note-text')) {
                        el.style.setProperty('color', '#000000', 'important');
                        el.style.setProperty('font-size', '14px', 'important');
                        el.style.setProperty('line-height', '1.6', 'important');
                    }

                    // Results header
                    if (classes.includes('results-title')) {
                        el.style.setProperty('color', '#cccccc', 'important');
                        el.style.setProperty('font-size', '28px', 'important');
                        el.style.setProperty('font-weight', 'normal', 'important');
                    }

                    if (classes.includes('results-count')) {
                        el.style.setProperty('color', '#cccccc', 'important');
                    }

                    // Signs grid - make it a vertical list
                    if (classes.includes('signs-grid')) {
                        el.style.setProperty('display', 'block', 'important');
                        el.style.setProperty('width', '100%', 'important');
                    }
                });
            };

            forceReadableStyles(resultsClone);

            // Add header with title and date
            const header = document.createElement('div');
            header.style.marginBottom = '30px';
            header.style.borderBottom = '2px solid #333';
            header.style.paddingBottom = '20px';
            header.innerHTML = `
                <h1 style="margin: 0 0 10px 0; font-size: 28px; color: #000000; font-weight: bold;">ASL Dictionary Translation</h1>
                <p style="margin: 0; color: #666666; font-size: 14px;">Generated on ${this.getFormattedDate()}</p>
            `;

            container.appendChild(header);
            container.appendChild(resultsClone);

            // Wait for layout to settle
            await new Promise(resolve => setTimeout(resolve, 100));

            // Get actual rendered height
            const actualHeight = container.scrollHeight;

            // Capture the container as canvas
            const canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                width: 800,
                height: actualHeight,
                windowWidth: 800,
                windowHeight: actualHeight,
            });

            // Calculate PDF dimensions
            const imgWidth = 210; // A4 width in mm
            const pageHeight = 297; // A4 height in mm
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            // Create PDF
            const doc = new jsPDF('p', 'mm', 'a4');
            const imgData = canvas.toDataURL('image/png');

            // Handle multi-page PDFs
            let heightLeft = imgHeight;
            let position = 0;

            // Add first page
            doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            // Add additional pages if needed
            while (heightLeft > 0) {
                position = -pageHeight * Math.floor((imgHeight - heightLeft) / pageHeight);
                doc.addPage();
                doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            // Download PDF
            const fileName = `ASL_Translation_${this.sanitizeFileName(query)}_${Date.now()}.pdf`;
            doc.save(fileName);

        } catch (error) {
            console.error('Error generating PDF:', error);
            throw new Error('Failed to generate PDF. Please try again.');
        } finally {
            // Always remove the temporary container, even if there was an error
            if (container && container.parentNode) {
                document.body.removeChild(container);
            }
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
