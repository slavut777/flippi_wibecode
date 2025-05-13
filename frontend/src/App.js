  // Prepare data for heatmap
  const getHeatmapData = () => {
    const visibleProps = getVisibleProperties();
    if (!visibleProps || visibleProps.length === 0) return [];
    
    return visibleProps.map(property => {
      if (!property.location || !property.location.coordinates) {
        console.warn("Property missing coordinates:", property);
        return null;
      }
      
      const coords = property.location.coordinates;
      let intensity = 1;
      
      // Adjust intensity based on price
      if (property.is_for_sale) {
        // Sale properties
        intensity = property.price / 1000000;  // Scale down sale prices (typically higher)
      } else {
        // Rental properties
        intensity = property.price / 3000;     // Scale down rental prices (typically lower)
      }
      
      return [
        coords[1], // latitude
        coords[0], // longitude
        intensity
      ];
    }).filter(Boolean); // Remove null values
  };