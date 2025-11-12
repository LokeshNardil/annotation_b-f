import { AnnotationViewer } from "@/components/AnnotationViewer";

/**
 * Example page demonstrating the AnnotationViewer component
 * You can replace these mock images with real image URLs
 */
const AnnotationViewerPage = () => {
  // Mock images - replace with your actual image URLs
  const images = [
    {
      id: "1",
      name: "Shear Wall Elevation",
      url: "/placeholder.svg", // Replace with actual image URL
    },
    {
      id: "2",
      name: "Foundation Plan",
      url: "/placeholder.svg", // Replace with actual image URL
    },
    {
      id: "3",
      name: "Detail Section",
      url: "/placeholder.svg", // Replace with actual image URL
    },
  ];

  return (
    <div className="h-screen w-screen">
      <AnnotationViewer images={images} initialImageId="1" />
    </div>
  );
};

export default AnnotationViewerPage;


