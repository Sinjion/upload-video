class CloudflareVideoUploader {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.selectedFile = null;
        this.isAdShowing = false;
        this.videoUrl = null;
        this.apiBase = ''; // Will be auto-detected
    }

    initializeElements() {
        // Upload elements
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.videoPreview = document.getElementById('videoPreview');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressBar = document.getElementById('progressBar');
        this.progressText = document.getElementById('progressText');
        this.statusMessage = document.getElementById('statusMessage');
        this.fileInfo = document.getElementById('fileInfo');
        
        // File info elements
        this.fileName = document.getElementById('fileName');
        this.fileSize = document.getElementById('fileSize');
        this.fileType = document.getElementById('fileType');
        
        // Video player elements
        this.videoPlayer = document.getElementById('videoPlayer');
        this.videoInfo = document.getElementById('videoInfo');
        this.videoStatus = document.getElementById('videoStatus');
        this.videoUrlElement = document.getElementById('videoUrl');
        this.videoDuration = document.getElementById('videoDuration');
        
        // Control buttons
        this.playBtn = document.getElementById('playBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        
        // Ad elements
        this.adContainer = document.getElementById('adContainer');
        this.adContent = document.getElementById('adContent');
        this.closeAdBtn = document.getElementById('closeAdBtn');
        
        // Videos list
        this.uploadedVideos = document.getElementById('uploadedVideos');
        this.videosList = document.getElementById('videosList');

        // Auto-detect API base URL
        this.apiBase = window.location.origin;
        console.log('API Base URL:', this.apiBase);
    }

    bindEvents() {
        // Upload events
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        this.uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        this.uploadBtn.addEventListener('click', this.uploadToR2.bind(this));
        
        // Video player events
        this.videoPlayer.addEventListener('loadedmetadata', this.updateVideoInfo.bind(this));
        this.videoPlayer.addEventListener('ended', this.showAd.bind(this));
        
        // Control events
        this.playBtn.addEventListener('click', () => this.videoPlayer.play());
        this.pauseBtn.addEventListener('click', () => this.videoPlayer.pause());
        this.fullscreenBtn.addEventListener('click', this.toggleFullscreen.bind(this));
        
        // Ad events
        this.closeAdBtn.addEventListener('click', this.closeAd.bind(this));
        this.adContent.addEventListener('click', this.handleAdClick.bind(this));
        
        // Global click for ad (when ad is showing)
        document.addEventListener('click', this.handleGlobalClick.bind(this));

        // Load existing videos on startup
        this.loadUploadedVideos();
    }

    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.6)';
        this.uploadArea.style.background = 'rgba(255, 255, 255, 0.05)';
    }

    handleDragLeave() {
        this.uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        this.uploadArea.style.background = 'transparent';
    }

    handleDrop(e) {
        e.preventDefault();
        this.uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        this.uploadArea.style.background = 'transparent';
        
        if (e.dataTransfer.files.length) {
            this.handleFileSelection(e.dataTransfer.files[0]);
        }
    }

    handleFileSelect(e) {
        if (e.target.files.length) {
            this.handleFileSelection(e.target.files[0]);
        }
    }

    handleFileSelection(file) {
        if (!file.type.startsWith('video/')) {
            this.showStatus('Harap pilih file video (MP4, WebM, MOV, dll).', 'error');
            return;
        }

        // Check file size (max 100MB)
        const maxSize = 100 * 1024 * 1024; // 100MB in bytes
        if (file.size > maxSize) {
            this.showStatus('Ukuran file terlalu besar. Maksimal 100MB.', 'error');
            return;
        }

        this.selectedFile = file;

        // Show file info
        this.showFileInfo(file);

        // Show video preview
        const videoURL = URL.createObjectURL(file);
        this.videoPreview.src = videoURL;
        this.videoPreview.style.display = 'block';

        // Enable upload button
        this.uploadBtn.disabled = false;
        this.uploadBtn.style.display = 'block';

        // Update upload area text
        this.uploadArea.querySelector('.upload-text').textContent = `File dipilih: ${file.name}`;

        // Hide any previous status messages
        this.hideStatus();
    }

    showFileInfo(file) {
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        this.fileName.textContent = file.name;
        this.fileSize.textContent = `${sizeInMB} MB`;
        this.fileType.textContent = file.type || 'Unknown';
        this.fileInfo.style.display = 'block';
    }

    async uploadToR2() {
        if (!this.selectedFile) return;

        // Show loading state
        this.showLoadingState(true);
        this.progressContainer.style.display = 'block';
        this.hideStatus();

        try {
            const formData = new FormData();
            formData.append('video', this.selectedFile);

            console.log('🚀 Starting upload...', {
                name: this.selectedFile.name,
                size: this.selectedFile.size,
                type: this.selectedFile.type,
                apiBase: this.apiBase
            });

            // Show upload progress
            await this.simulateUploadProgress();
            
            // Actual upload dengan better error handling
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.log('⏰ Upload timeout reached');
                controller.abort();
            }, 120000); // 120 second timeout untuk file besar

            try {
                console.log('📤 Sending fetch request...');
                const response = await fetch(`${this.apiBase}/api/upload`, {
                    method: 'POST',
                    body: formData,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                console.log('📨 Upload response status:', response.status, response.statusText);

                // Get response as text first
                const responseText = await response.text();
                console.log('📝 Raw response text:', responseText.substring(0, 500) + '...');

                // Check if response is empty
                if (!responseText || responseText.trim() === '') {
                    throw new Error('Server returned empty response');
                }

                let result;
                try {
                    result = JSON.parse(responseText);
                    console.log('✅ JSON parsed successfully:', result);
                } catch (parseError) {
                    console.error('❌ JSON parse error:', parseError);
                    console.error('📄 Full response:', responseText);
                    
                    if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html')) {
                        throw new Error('Server returned HTML instead of JSON - mungkin Workers error');
                    } else if (responseText.includes('worker error')) {
                        throw new Error('Cloudflare Workers error occurred');
                    } else {
                        throw new Error(`Invalid server response: ${responseText.substring(0, 200)}`);
                    }
                }

                if (!response.ok) {
                    throw new Error(result.error || `Server error: ${response.status} ${response.statusText}`);
                }

                if (result.success) {
                    this.videoUrl = result.url;
                    this.showStatus(`✅ Video berhasil diupload! URL: ${result.url}`, 'success');
                    
                    // Set up video player
                    this.setupVideoPlayer(this.videoUrl);
                    
                    // Reload videos list
                    this.loadUploadedVideos();
                    
                    // Reset upload form after delay
                    setTimeout(() => {
                        this.resetUploadForm();
                    }, 3000);
                } else {
                    throw new Error(result.error || 'Upload failed without error message');
                }
                
            } catch (fetchError) {
                clearTimeout(timeoutId);
                throw fetchError;
            }
            
        } catch (error) {
            console.error('💥 Upload error:', error);
            let errorMessage = `❌ Upload gagal: ${error.message}`;
            
            if (error.name === 'AbortError') {
                errorMessage = '❌ Upload timeout - file mungkin terlalu besar, coba file lebih kecil';
            } else if (error.message.includes('Failed to fetch')) {
                errorMessage = '❌ Koneksi gagal - periksa internet Anda';
            } else if (error.message.includes('HTML')) {
                errorMessage = '❌ Server error - coba lagi beberapa saat';
            }
            
            this.showStatus(errorMessage, 'error');
        } finally {
            this.showLoadingState(false);
            this.progressContainer.style.display = 'none';
        }
    }

    showLoadingState(loading) {
        const btnText = this.uploadBtn.querySelector('.btn-text');
        const btnLoading = this.uploadBtn.querySelector('.btn-loading');
        
        if (loading) {
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline';
            this.uploadBtn.disabled = true;
        } else {
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
            this.uploadBtn.disabled = false;
        }
    }

    simulateUploadProgress() {
        return new Promise((resolve) => {
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 15;
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(interval);
                    resolve();
                }
                
                this.progressBar.style.width = `${progress}%`;
                this.progressText.textContent = `${Math.round(progress)}% terupload`;
            }, 200);
        });
    }

    setupVideoPlayer(videoUrl) {
        this.videoPlayer.src = videoUrl;
        this.videoPlayer.style.display = 'block';
        
        // Update video info
        this.videoStatus.textContent = 'Video siap diputar';
        this.videoUrlElement.textContent = videoUrl;
        this.videoUrlElement.innerHTML = `<a href="${videoUrl}" target="_blank" style="color: #fdbb2d;">${videoUrl}</a>`;
    }

    updateVideoInfo() {
        const duration = this.videoPlayer.duration;
        if (duration && isFinite(duration)) {
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            this.videoDuration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    async loadUploadedVideos() {
        try {
            const response = await fetch(`${this.apiBase}/api/videos`);
            const result = await response.json();
            
            if (result.success && result.videos.length > 0) {
                this.displayVideosList(result.videos);
            } else {
                this.videosList.innerHTML = '<p class="no-videos">Belum ada video</p>';
            }
        } catch (error) {
            console.error('Failed to load videos:', error);
            this.videosList.innerHTML = '<p class="no-videos">Gagal memuat daftar video</p>';
        }
    }

    displayVideosList(videos) {
        this.videosList.innerHTML = videos.map(video => `
            <div class="video-item" onclick="uploader.playVideo('${video.url}')">
                <div class="name">${video.key.split('/').pop()}</div>
                <div class="size">${(video.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
        `).join('');
    }

    playVideo(videoUrl) {
        this.videoPlayer.src = videoUrl;
        this.videoPlayer.style.display = 'block';
        this.videoPlayer.play();
        
        this.videoStatus.textContent = 'Video sedang diputar';
        this.videoUrlElement.innerHTML = `<a href="${videoUrl}" target="_blank" style="color: #fdbb2d;">${videoUrl}</a>`;
    }

    showAd() {
        this.isAdShowing = true;
        this.adContainer.style.display = 'block';
        
        // Simulate ad loading
        this.adContent.innerHTML = `
            <div class="ad-placeholder">
                <div class="loading"></div>
                <p>Memuat iklan Adsterra...</p>
            </div>
        `;
        
        setTimeout(() => {
            this.displayAdContent();
        }, 2000);
    }

    displayAdContent() {
        const adLink = 'https://godlessgirlsmoothly.com/rr290s13?key=999d2721eb4571e392f4a8a4eb2abece'; // Default Adsterra link
        
        this.adContent.innerHTML = `
            <div class="ad-placeholder">
                <div class="ad-banner" onclick="window.open('${adLink}', '_blank')">
                    <h3>🎉 SPESIAL UNTUK ANDA! 🎉</h3>
                    <p>Klik untuk penawaran menakjubkan</p>
                </div>
                <p>Klik banner di atas atau tap di mana saja untuk mengunjungi advertiser</p>
                <p class="tap-info">Iklan oleh Adsterra - Powered by Cloudflare</p>
            </div>
        `;
    }

    handleAdClick(e) {
        e.stopPropagation();
        window.open('https://godlessgirlsmoothly.com/rr290s13?key=999d2721eb4571e392f4a8a4eb2abece', '_blank');
    }

    handleGlobalClick(e) {
        if (this.isAdShowing && !this.adContainer.contains(e.target)) {
            window.open('https://godlessgirlsmoothly.com/rr290s13?key=999d2721eb4571e392f4a8a4eb2abece', '_blank');
        }
    }

    closeAd() {
        this.adContainer.style.display = 'none';
        this.isAdShowing = false;
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.videoPlayer.requestFullscreen().catch(err => {
                console.log(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }

    resetUploadForm() {
        this.uploadBtn.style.display = 'none';
        this.videoPreview.style.display = 'none';
        this.progressContainer.style.display = 'none';
        this.fileInfo.style.display = 'none';
        this.uploadArea.querySelector('.upload-text').textContent = 'Drag & drop file video Anda di sini';
        this.selectedFile = null;
        this.fileInput.value = '';
        this.progressBar.style.width = '0%';
        this.showLoadingState(false);
    }

    showStatus(message, type) {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message ${type}`;
        this.statusMessage.style.display = 'block';
        
        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                this.hideStatus();
            }, 5000);
        }
    }

    hideStatus() {
        this.statusMessage.style.display = 'none';
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.uploader = new CloudflareVideoUploader();
    console.log('Cloudflare Video Uploader initialized!');
    
    // Test API connection
    fetch(`${window.location.origin}/api/health`)
        .then(response => response.json())
        .then(data => console.log('API Health:', data))
        .catch(error => console.error('API Health Check Failed:', error));
});