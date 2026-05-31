const mongoose = require("mongoose");

const testimonialSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
        },
        role: {
            type: String,
            default: "Loyal Client",
            trim: true,
        },
        text: {
            type: String,
            required: [true, "Testimonial text is required"],
            trim: true,
        },
        rating: {
            type: Number,
            min: 1,
            max: 5,
            default: 5,
        },
        avatar: {
            type: String,
            default: "",
        },
    },
    {
        timestamps: true, // adds createdAt and updatedAt
    }
);

// Auto-generate avatar from name before saving
testimonialSchema.pre("save", function (next) {
    if (!this.avatar || this.avatar === "") {
        const initials = this.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
        this.avatar = initials;
    }
    next();
});

module.exports = mongoose.model("Testimonial", testimonialSchema);