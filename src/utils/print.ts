/**
 * Print Utility
 * Handles print-friendly formatting
 */

export const print = {
    /**
     * Trigger browser print dialog
     */
    printPage(): void {
        window.print();
    },

    /**
     * Format date for print header
     */
    getFormattedDate(): string {
        return new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    },

    /**
     * Add print-specific class to body before printing
     */
    preparePrint(): void {
        document.body.classList.add('printing');
    },

    /**
     * Remove print-specific class after printing
     */
    cleanupPrint(): void {
        document.body.classList.remove('printing');
    },

    /**
     * Setup print event listeners
     */
    setupPrintListeners(): () => void {
        const beforePrint = () => this.preparePrint();
        const afterPrint = () => this.cleanupPrint();

        window.addEventListener('beforeprint', beforePrint);
        window.addEventListener('afterprint', afterPrint);

        // Return cleanup function
        return () => {
            window.removeEventListener('beforeprint', beforePrint);
            window.removeEventListener('afterprint', afterPrint);
        };
    },
};
