import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Zap, Box, MousePointer2 } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6">
            <ImageIcon className="w-10 h-10 text-primary" />
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Image Canvas Annotator
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
            Professional-grade image annotation tool with cursor-centric zoom, 
            precise rectangle drawing, and seamless multi-select. Built for speed and accuracy.
          </p>
          
          <div className="flex gap-4 justify-center flex-wrap">
            <Link to="/login">
              <Button size="lg" variant="secondary" className="text-lg px-8">
                Try Demo Login
              </Button>
            </Link>
            <Link to="/annotate">
              <Button size="lg" className="text-lg px-8">
                Start Annotating (Canvas)
              </Button>
            </Link>
            <Link to="/annotate-konva">
              <Button size="lg" variant="default" className="text-lg px-8">
                Start Annotating (Konva)
              </Button>
            </Link>
            <Link to="/annotation-viewer">
              <Button size="lg" variant="outline" className="text-lg px-8">
                Annotation Viewer
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mt-24">
          <div className="bg-card p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Cursor-Centric Zoom</h3>
            <p className="text-muted-foreground text-sm">
              Zoom in and out exactly where you want with intelligent cursor tracking. 
              No more jumping around the canvas.
            </p>
          </div>

          <div className="bg-card p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
              <Box className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Precise Annotations</h3>
            <p className="text-muted-foreground text-sm">
              Draw rectangles with pixel-perfect accuracy. Move, resize, and label 
              with professional-grade tools.
            </p>
          </div>

          <div className="bg-card p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <MousePointer2 className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Multi-Select Power</h3>
            <p className="text-muted-foreground text-sm">
              Select multiple annotations with Shift+Click or marquee selection. 
              Batch edit with ease.
            </p>
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="max-w-4xl mx-auto mt-24">
          <h2 className="text-3xl font-bold text-center mb-8">Keyboard Shortcuts</h2>
          
          <div className="grid md:grid-cols-2 gap-4 bg-card p-8 rounded-xl border border-border">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Select Tool</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">V</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rectangle Tool</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">R</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pan</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">Space + Drag</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Zoom In/Out</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">+/-</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Fit to Screen</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">F</kbd>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reset Zoom</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">0</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Delete Selected</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">Del</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Undo</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">Ctrl+Z</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Redo</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">Ctrl+Shift+Z / Ctrl+Y</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cancel</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">Esc</kbd>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="max-w-3xl mx-auto mt-24 text-center">
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 p-12 rounded-2xl border border-border">
            <h2 className="text-3xl font-bold mb-4">Ready to annotate?</h2>
            <p className="text-muted-foreground mb-6">
              Upload your images and start creating precise annotations with our powerful tools.
            </p>
            <Link to="/annotate">
              <Button size="lg" className="text-lg px-8">
                Launch Annotator
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
