from PIL import Image, ImageDraw

def main():
    # Create a 200x200 white image
    img = Image.new("RGB", (200, 200), "white")
    draw = ImageDraw.Draw(img)
    
    # Draw a black circular ring (hollow center)
    draw.ellipse([40, 40, 160, 160], fill="black")
    draw.ellipse([70, 70, 130, 130], fill="white")
    
    img.save("test_input.png")
    print("Test image 'test_input.png' generated successfully.")

if __name__ == '__main__':
    main()
